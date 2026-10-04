-- The customer record, and the referral number that hangs off it.
--
-- WHY THIS TABLE DID NOT EXIST BEFORE
--
-- Until now a customer was two free-text columns on each invoice. That is enough
-- to print a bill and not enough to recognise a returning person: the same
-- customer buying twice left two unrelated strings behind, with nothing tying
-- them together. A referral reward belongs to a PERSON, so the person has to
-- exist as a row before any of it can work.
--
-- THE PHONE IS THE IDENTITY
--
-- `phone` holds a normalised value (digits only, last 10 for an Indian number)
-- and is unique. It is the only field the shop already captures on every bill and
-- the only one a customer says the same way every visit. `phone_display` keeps
-- what was actually typed, so a bill can still read "+91 85010 34991".
--
-- Names are NOT unique and are never used to match. Two real customers can share
-- a name, and merging them would move one person's points to another.
--
-- `referral_code` is server-generated and unique. It is never accepted from a
-- client, so staff cannot choose or duplicate one.
--
-- `reward_points` is the live balance; `total_referral_points_earned` and
-- `total_points_redeemed` are lifetime counters for reporting and are never
-- reduced by a redemption. The balance is always written in the same transaction
-- as its ledger entry (a later migration), so the two cannot drift.
--
-- `flagged_for_review` is set when a reversal would push the balance negative
-- because the points were already spent. The shopkeeper gets a flag to look at,
-- rather than an unexplainable negative balance.
CREATE TABLE IF NOT EXISTS customers (
  id serial PRIMARY KEY,
  name text NOT NULL,
  phone text NOT NULL UNIQUE,
  phone_display text,
  email text,
  referral_code text NOT NULL UNIQUE,
  reward_points integer NOT NULL DEFAULT 0,
  total_referral_points_earned integer NOT NULL DEFAULT 0,
  total_points_redeemed integer NOT NULL DEFAULT 0,
  flagged_for_review boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_name_idx ON customers (name);
CREATE INDEX IF NOT EXISTS customers_created_idx ON customers (created_at);
-- A guard the application also enforces: a balance can never go negative.
-- Belt and braces, because a negative points balance is a bug that is very hard
-- to unpick once it has been spent against a real bill.
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_points_non_negative;
ALTER TABLE customers
ADD CONSTRAINT customers_points_non_negative CHECK (reward_points >= 0);
-- The link from a bill to the person who paid it.
--
-- Nullable, and deliberately not a hard foreign key with ON DELETE CASCADE: a
-- bill is a financial record and must survive independently of the customer row.
-- ON DELETE SET NULL means removing a customer detaches the history rather than
-- destroying the invoice.
ALTER TABLE billing_transactions
ADD COLUMN IF NOT EXISTS customer_id integer;
ALTER TABLE billing_transactions DROP CONSTRAINT IF EXISTS billing_transactions_customer_id_fkey;
ALTER TABLE billing_transactions
ADD CONSTRAINT billing_transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE
SET NULL;
CREATE INDEX IF NOT EXISTS billing_transactions_customer_idx ON billing_transactions (customer_id);
-- ---------------------------------------------------------------------------
-- Backfill: existing customers without referral numbers
-- ---------------------------------------------------------------------------
--
-- Approved approach: create a customer ONLY where a usable phone number exists.
--
-- Of the invoices present, one has a phone. The others have a name with no phone,
-- or nothing at all, and a name alone is not a safe identity — creating "Bhavya"
-- as a customer today would silently merge them with a different Bhavya next
-- month. Those invoices keep their free-text name and simply have no customer
-- link, which is the honest state: they cannot be reliably attributed.
--
-- No existing row is modified. Existing invoice numbers, names, phones, amounts
-- and dates are all left exactly as they were; this only ADDS a link.
--
-- The normalisation below is the same rule the application uses, written out
-- again here so the backfill does not depend on application code:
--
--   · strip every non-digit
--   · drop a leading country code, keeping the last 10 digits
--   · require at least 10 digits, otherwise the number is not usable
--
-- Referral codes are generated as SML + a zero-padded sequence, and the sequence
-- starts above 10000 so the first real customer is SML10001 rather than SML1.
WITH normalised AS (
  SELECT bt.id,
    bt.customer_name,
    bt.customer_phone,
    right(
      regexp_replace(bt.customer_phone, '\D', '', 'g'),
      10
    ) AS phone,
    length(regexp_replace(bt.customer_phone, '\D', '', 'g')) AS digits
  FROM billing_transactions bt
  WHERE bt.customer_id IS NULL
    AND bt.customer_phone IS NOT NULL
    AND length(regexp_replace(bt.customer_phone, '\D', '', 'g')) >= 10
),
-- One customer per distinct phone, keeping the most recent name we saw for it.
distinct_customers AS (
  SELECT DISTINCT ON (phone) phone,
    coalesce(
      nullif(btrim(customer_name), ''),
      'Customer ' || phone
    ) AS name,
    customer_phone AS phone_display
  FROM normalised
  ORDER BY phone,
    id DESC
),
numbered AS (
  SELECT dc.*,
    row_number() OVER (
      ORDER BY dc.phone
    ) AS seq
  FROM distinct_customers dc
  WHERE NOT EXISTS (
      SELECT 1
      FROM customers c
      WHERE c.phone = dc.phone
    )
),
inserted AS (
  INSERT INTO customers (name, phone, phone_display, referral_code)
  SELECT n.name,
    n.phone,
    n.phone_display,
    'SML' || lpad((10000 + n.seq)::text, 5, '0')
  FROM numbered n ON CONFLICT (phone) DO NOTHING
  RETURNING id,
    phone
)
SELECT count(*) FROM inserted;

-- ---------------------------------------------------------------------------
-- Link the existing invoices to the customers that now exist.
--
-- This is a SEPARATE statement on purpose, and it re-derives the normalised
-- phone rather than depending on anything the INSERT returned.
--
-- The first version of this migration ran the update as a second statement that
-- referenced the insert's CTE. A CTE only lives for the statement that declares
-- it, so PostgreSQL discarded the insert as unreferenced and NOTHING was linked:
-- the customer was created and every invoice was left unattached. Matching on the
-- stored `customers.phone` instead makes this statement self-contained — it works
-- whether the customer was created just now by the backfill or already existed
-- from an earlier run, which also makes the whole migration safe to re-run.
-- ---------------------------------------------------------------------------
UPDATE billing_transactions bt
SET customer_id = c.id
FROM customers c
WHERE bt.customer_id IS NULL
  AND bt.customer_phone IS NOT NULL
  AND length(regexp_replace(bt.customer_phone, '\D', '', 'g')) >= 10
  AND c.phone = right(
    regexp_replace(bt.customer_phone, '\D', '', 'g'),
    10
  );
-- ---------------------------------------------------------------------------
-- The referral code sequence, for NEW customers going forward
-- ---------------------------------------------------------------------------
--
-- The backfill above numbers its rows in one pass. New customers need to keep
-- counting from there, and two staff members saving at the same moment must not
-- be handed the same number — so the counter lives in the database and is read
-- with a lock, not computed in application code.
CREATE TABLE IF NOT EXISTS referral_code_sequence (
  id integer PRIMARY KEY DEFAULT 1,
  last_seq integer NOT NULL DEFAULT 10000,
  CONSTRAINT referral_code_sequence_single_row CHECK (id = 1)
);
INSERT INTO referral_code_sequence (id, last_seq)
VALUES (
    1,
    GREATEST(
      10000,
      (
        SELECT count(*)
        FROM customers
      ) + 10000
    )
  ) ON CONFLICT (id) DO NOTHING;
-- Keep the counter ahead of anything already issued, so a re-run can never
-- hand out a code that is already in use.
UPDATE referral_code_sequence
SET last_seq = GREATEST(
    last_seq,
    coalesce(
      (
        SELECT max(
            nullif(regexp_replace(referral_code, '\D', '', 'g'), '')::int
          )
        FROM customers
      ),
      10000
    )
  );