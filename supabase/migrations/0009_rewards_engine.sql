-- The rewards engine: the shop's rule, the referral record, and the points ledger.
--
-- THREE TABLES, THREE DIFFERENT JOBS
--
--   reward_settings        the rule in force today (₹500 -> 30 points, 1 pt = ₹1)
--   referral_transactions  the permanent record that a purchase earned points
--   reward_ledger          every single movement of points, append-only
--
-- WHY ALL THREE
--
-- A balance on its own is not enough. The customers table holds `reward_points`
-- so screens do not have to sum anything, but that number cannot answer "why?"
-- — and a customer asking about a missing reward is the most common question a
-- scheme like this produces. The ledger answers it line by line, and the referral
-- table records the purchase that started it.
--
-- The rule lives in a table rather than in code because a shop changes its
-- festival rate without wanting a deploy. It applies to FUTURE transactions only:
-- each referral row stores the points it was actually awarded, so changing the
-- rate can never rewrite a settled promise to a customer.
-- ---------------------------------------------------------------------------
-- The rule. One row, id = 1.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reward_settings (
  id integer PRIMARY KEY DEFAULT 1,
  referral_enabled boolean NOT NULL DEFAULT true,
  referral_amount_step numeric(12, 2) NOT NULL DEFAULT '500',
  points_per_step integer NOT NULL DEFAULT 30,
  redemption_value_per_point numeric(12, 2) NOT NULL DEFAULT '1',
  minimum_points_to_redeem integer NOT NULL DEFAULT 0,
  maximum_points_per_bill integer NOT NULL DEFAULT 0,
  allow_manual_adjustment boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reward_settings_single_row CHECK (id = 1)
);
-- Seed the row with the agreed starting rule. ON CONFLICT DO NOTHING so a re-run
-- never resets a rule the shopkeeper has since changed.
INSERT INTO reward_settings (id)
VALUES (1) ON CONFLICT (id) DO NOTHING;
-- ---------------------------------------------------------------------------
-- Referral transactions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_transactions (
  id serial PRIMARY KEY,
  referral_code text NOT NULL,
  referrer_customer_id integer NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
  referred_customer_name text NOT NULL,
  referred_customer_phone text,
  invoice_number text NOT NULL,
  bill_amount numeric(12, 2) NOT NULL,
  points_earned integer NOT NULL,
  -- The rule as it stood when this was awarded. Kept so an old transaction can
  -- always be explained, even after the shop has changed the rate twice.
  settings_snapshot text,
  status text NOT NULL DEFAULT 'CREDITED',
  purchase_date date,
  notes text,
  created_by text NOT NULL,
  updated_by text,
  reversed_at timestamptz,
  reversed_by text,
  reversal_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_transactions_status_check CHECK (status IN ('CREDITED', 'REVERSED'))
);
-- THE GUARD AGAINST PAYING TWICE.
--
-- A unique index on the invoice number, not a check-then-insert in application
-- code. Two staff members entering the same bill at the same moment both pass an
-- application check and both insert; only one can satisfy a unique index. This is
-- the single most important constraint in the feature, because a double credit is
-- real money given away and is invisible unless someone reconciles by hand.
CREATE UNIQUE INDEX IF NOT EXISTS referral_transactions_invoice_unique ON referral_transactions (invoice_number);
CREATE INDEX IF NOT EXISTS referral_transactions_referrer_idx ON referral_transactions (referrer_customer_id);
CREATE INDEX IF NOT EXISTS referral_transactions_created_idx ON referral_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS referral_transactions_status_idx ON referral_transactions (status);
-- ---------------------------------------------------------------------------
-- The points ledger — append-only
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reward_ledger (
  id serial PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
  -- REFERRAL_EARNED | REDEEMED | ADJUSTMENT | REVERSAL
  type text NOT NULL,
  -- Signed: positive credits, negative deducts. The sign IS the direction, so
  -- there is no separate column that could disagree with it.
  points integer NOT NULL,
  -- The balance immediately after this entry, so history reads correctly without
  -- replaying the whole table.
  balance_after integer NOT NULL,
  reference_id text,
  description text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reward_ledger_type_check CHECK (
    type IN (
      'REFERRAL_EARNED',
      'REDEEMED',
      'ADJUSTMENT',
      'REVERSAL'
    )
  ),
  -- A zero-point movement is not a movement; it would only add noise to history.
  CONSTRAINT reward_ledger_non_zero CHECK (points <> 0)
);
CREATE INDEX IF NOT EXISTS reward_ledger_customer_idx ON reward_ledger (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reward_ledger_type_idx ON reward_ledger (type);
-- ---------------------------------------------------------------------------
-- Which invoice a redemption was spent against
-- ---------------------------------------------------------------------------
--
-- A redemption happens at billing, and the invoice it discounts is created in the
-- same request. This column records that link so a refunded bill can reverse its
-- redemption the same way it reverses a referral. Nullable because a manual
-- adjustment has no invoice.
ALTER TABLE reward_ledger
ADD COLUMN IF NOT EXISTS invoice_number text;
CREATE INDEX IF NOT EXISTS reward_ledger_invoice_idx ON reward_ledger (invoice_number);
-- ---------------------------------------------------------------------------
-- Consistency backstop on the balance
-- ---------------------------------------------------------------------------
--
-- The application computes every balance inside a transaction and refuses to go
-- negative, and the customers table already carries a CHECK for it. This adds the
-- matching guard on the ledger's recorded running balance, so a bug that wrote a
-- negative `balance_after` fails loudly at the moment it happens rather than
-- surfacing later as an unexplainable statement.
ALTER TABLE reward_ledger DROP CONSTRAINT IF EXISTS reward_ledger_balance_non_negative;
ALTER TABLE reward_ledger
ADD CONSTRAINT reward_ledger_balance_non_negative CHECK (balance_after >= 0);