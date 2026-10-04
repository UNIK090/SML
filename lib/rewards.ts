// The rewards engine.
//
// EVERYTHING IN THIS FILE RUNS ON THE SERVER, INSIDE A TRANSACTION
//
// The rules are simple — a bill earns points, points buy rupees — and the reason
// this file is careful is that a points balance is money. A double credit, a
// redemption that outruns the balance, or a reversal that leaves a negative
// number are all ways a shop quietly loses money or trust. So:
//
//   · no balance is ever written without its ledger row, in the same transaction
//   · no balance is ever trusted from the client; the server recomputes it
//   · the invoice number is unique at the database level, so two staff members
//     entering the same bill cannot both be paid
//   · a reversal reverses; it never deletes. The history has to keep showing that
//     the reward was given and then taken back.
//
// The balance on `customers` is a convenience for screens. The ledger is the
// truth, and the two are written together or not at all.

import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers, referralTransactions, rewardLedger, rewardSettings } from '@/lib/db/schema'
import { pointsForBill } from '@/lib/customers'

/** The rule currently in force. Falls back to the agreed defaults if unseeded. */
export type RewardSettings = {
  referralEnabled: boolean
  referralAmountStep: number
  pointsPerStep: number
  redemptionValuePerPoint: number
  minimumPointsToRedeem: number
  maximumPointsPerBill: number
  allowManualAdjustment: boolean
}

const DEFAULT_SETTINGS: RewardSettings = {
  referralEnabled: true,
  referralAmountStep: 500,
  pointsPerStep: 30,
  redemptionValuePerPoint: 1,
  minimumPointsToRedeem: 0,
  maximumPointsPerBill: 0,
  allowManualAdjustment: true,
}

export async function getRewardSettings(): Promise<RewardSettings> {
  const [row] = await db.select().from(rewardSettings).where(eq(rewardSettings.id, 1))
  if (!row) return DEFAULT_SETTINGS
  return {
    referralEnabled: row.referralEnabled,
    referralAmountStep: Number(row.referralAmountStep),
    pointsPerStep: row.pointsPerStep,
    redemptionValuePerPoint: Number(row.redemptionValuePerPoint),
    minimumPointsToRedeem: row.minimumPointsToRedeem,
    maximumPointsPerBill: row.maximumPointsPerBill,
    allowManualAdjustment: row.allowManualAdjustment,
  }
}

/** A transaction handle, so helpers can run inside the caller's transaction. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Moves a customer's balance and writes the matching ledger row.
 *
 * This is the ONLY place `reward_points` is written. Every feature that moves
 * points — a referral, a redemption, an adjustment, a reversal — goes through
 * here, so there is exactly one place to check the arithmetic and one place where
 * a ledger row could go missing.
 *
 * The balance is read with `FOR UPDATE`, which locks the row for the rest of the
 * transaction. Two concurrent movements on one customer therefore queue: without
 * the lock both would read 100, both would add 50, and the customer would end up
 * with 150 while the ledger claimed 200 — the classic lost update.
 *
 * `delta` is signed. A negative delta that would take the balance below zero is
 * refused rather than clamped, because clamping would silently hide a bug and
 * leave the ledger disagreeing with the balance.
 */
async function applyPoints(
  tx: Tx,
  input: {
    customerId: number
    delta: number
    type: 'REFERRAL_EARNED' | 'REDEEMED' | 'ADJUSTMENT' | 'REVERSAL'
    description: string
    createdBy: string
    referenceId?: string | null
    invoiceNumber?: string | null
    /** Lifetime counters to move alongside the balance, if any. */
    earnedDelta?: number
    redeemedDelta?: number
  },
): Promise<{ balanceAfter: number } | { error: string }> {
  const delta = Math.trunc(input.delta)
  if (!Number.isFinite(delta) || delta === 0) {
    return { error: 'That is not a points movement.' }
  }

  // Lock the customer row for the duration of the transaction.
  const locked = await tx.execute(sql`SELECT reward_points FROM customers WHERE id = ${input.customerId} FOR UPDATE`)
  const rows = (locked as unknown as { rows?: { reward_points: number }[] }).rows ?? []
  const current = rows[0]?.reward_points
  if (typeof current !== 'number') return { error: 'Customer not found.' }

  const balanceAfter = current + delta
  if (balanceAfter < 0) {
    // Refused, not clamped. A negative balance means the caller asked for more
    // points than exist, and hiding that would leave the ledger lying.
    return { error: `Not enough points. Available: ${current}, requested: ${Math.abs(delta)}.` }
  }

  await tx
    .update(customers)
    .set({
      rewardPoints: balanceAfter,
      // Lifetime counters only ever climb. A redemption reduces the spendable
      // balance but must not reduce what the customer has earned in total, or the
      // shop loses the ability to answer "how much has this person earned from us?"
      ...(input.earnedDelta ? { totalReferralPointsEarned: sql`${customers.totalReferralPointsEarned} + ${input.earnedDelta}` } : {}),
      ...(input.redeemedDelta ? { totalPointsRedeemed: sql`${customers.totalPointsRedeemed} + ${input.redeemedDelta}` } : {}),
      updatedAt: new Date(),
    })
    .where(eq(customers.id, input.customerId))

  await tx.insert(rewardLedger).values({
    customerId: input.customerId,
    type: input.type,
    points: delta,
    balanceAfter,
    referenceId: input.referenceId ?? null,
    invoiceNumber: input.invoiceNumber ?? null,
    description: input.description,
    createdBy: input.createdBy,
  })

  return { balanceAfter }
}

export type CreditReferralInput = {
  referralCode: unknown
  referredCustomerName: unknown
  referredCustomerPhone?: unknown
  invoiceNumber: unknown
  billAmount: unknown
  purchaseDate?: unknown
  notes?: unknown
  createdBy: string
}

/**
 * Credits a referral: a purchase was made by someone the customer referred.
 *
 * The points are calculated here, on the server, from the shop's current rule —
 * never accepted from the browser. A client-supplied point value would let anyone
 * award themselves a fortune, and the preview the staff member sees is only a
 * preview until this function agrees with it.
 *
 * Returns the same shape for a preview and for a real credit, so the confirm step
 * shows exactly what was saved rather than a second calculation that might differ.
 */
export async function creditReferral(input: CreditReferralInput) {
  const code = typeof input.referralCode === 'string' ? input.referralCode.trim().toUpperCase() : ''
  const referredName = typeof input.referredCustomerName === 'string' ? input.referredCustomerName.trim().slice(0, 120) : ''
  const invoiceNumber = typeof input.invoiceNumber === 'string' ? input.invoiceNumber.trim().slice(0, 60) : ''
  const billAmount = Number(input.billAmount)
  const notes = typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim().slice(0, 500) : null
  const purchaseDate = typeof input.purchaseDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.purchaseDate) ? input.purchaseDate : null
  const referredPhone = typeof input.referredCustomerPhone === 'string' ? input.referredCustomerPhone.trim().slice(0, 40) : null

  if (!code) return { error: 'Enter the customer’s referral number.' }
  if (!invoiceNumber) return { error: 'Enter the bill or invoice number.' }
  if (!Number.isFinite(billAmount) || billAmount <= 0) return { error: 'Enter a bill amount greater than zero.' }

  const settings = await getRewardSettings()
  if (!settings.referralEnabled) {
    return { error: 'The referral programme is switched off. Turn it on in Rewards settings first.' }
  }

  // The referrer, by code.
  const [referrer] = await db.select().from(customers).where(eq(customers.referralCode, code))
  if (!referrer) return { error: `No customer has the referral number ${code}.` }
  if (!referrer.active) return { error: `${referrer.name}’s account is inactive, so it cannot earn points.` }

  // The referred customer cannot be the referrer. Matched on the normalised phone
  // where both are known, because that is the only identity this system can trust
  // — a name alone is not proof, and refusing on a name would block genuine
  // referrals between family members who share a surname.
  if (referredPhone) {
    const digits = referredPhone.replace(/\D/g, '')
    const local = digits.length > 10 ? digits.slice(-10) : digits
    if (local === referrer.phone) {
      return { error: 'A customer cannot earn points on their own purchase.' }
    }
  }

  const pointsEarned = pointsForBill(billAmount, settings)
  if (pointsEarned <= 0) {
    return {
      error: `A bill of ₹${Math.round(billAmount)} earns no points. The first block is ₹${settings.referralAmountStep}.`,
    }
  }

  // The duplicate guard is the unique index on invoice_number. We pre-check so the
  // common case gets a clear message, and still catch the constraint violation
  // below so a genuine race is refused rather than credited twice.
  const [already] = await db
    .select({ id: referralTransactions.id, status: referralTransactions.status })
    .from(referralTransactions)
    .where(eq(referralTransactions.invoiceNumber, invoiceNumber))
  if (already) {
    return { error: `Invoice ${invoiceNumber} has already earned referral points.` }
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [referral] = await tx
        .insert(referralTransactions)
        .values({
          referralCode: code,
          referrerCustomerId: referrer.id,
          referredCustomerName: referredName || 'Walk-in customer',
          referredCustomerPhone: referredPhone,
          invoiceNumber,
          billAmount: billAmount.toFixed(2),
          pointsEarned,
          settingsSnapshot: JSON.stringify(settings),
          status: 'CREDITED',
          purchaseDate,
          notes,
          createdBy: input.createdBy,
        })
        .returning()

      const moved = await applyPoints(tx, {
        customerId: referrer.id,
        delta: pointsEarned,
        type: 'REFERRAL_EARNED',
        description: `Referral purchase – ${invoiceNumber}`,
        createdBy: input.createdBy,
        referenceId: String(referral.id),
        invoiceNumber,
        earnedDelta: pointsEarned,
      })
      if ('error' in moved) throw new Error(moved.error)

      return { referral, balanceAfter: moved.balanceAfter }
    })

    return {
      referral: result.referral,
      pointsEarned,
      balanceAfter: result.balanceAfter,
      referrer: { id: referrer.id, name: referrer.name, phone: referrer.phone, referralCode: referrer.referralCode },
      notification: buildReferralMessage(referrer.name, pointsEarned, result.balanceAfter),
    }
  } catch (error) {
    // A unique-index violation here means another request inserted the same
    // invoice between our pre-check and our insert. That is exactly the race the
    // index exists to lose, so it is reported as a duplicate rather than an error.
    const message = String(error)
    if (message.includes('referral_transactions_invoice_unique') || message.includes('duplicate key')) {
      return { error: `Invoice ${invoiceNumber} has already earned referral points.` }
    }
    throw error
  }
}

/**
 * What the staff member should see before confirming.
 *
 * Deliberately the same calculation the credit will use, so the preview and the
 * saved figure cannot disagree — a confirm dialog that promises 90 and a record
 * that stores 60 is worse than no preview at all.
 */
export async function previewReferral(input: { referralCode: unknown; billAmount: unknown }) {
  const code = typeof input.referralCode === 'string' ? input.referralCode.trim().toUpperCase() : ''
  const billAmount = Number(input.billAmount)
  if (!code) return { error: 'Enter the customer’s referral number.' }

  const [referrer] = await db.select().from(customers).where(eq(customers.referralCode, code))
  if (!referrer) return { error: `No customer has the referral number ${code}.` }

  const settings = await getRewardSettings()
  return {
    referrer: {
      id: referrer.id,
      name: referrer.name,
      phone: referrer.phone,
      phoneDisplay: referrer.phoneDisplay,
      referralCode: referrer.referralCode,
      rewardPoints: referrer.rewardPoints,
      active: referrer.active,
    },
    pointsEarned: pointsForBill(billAmount, settings),
    settings,
  }
}

/**
 * Reverses a referral — the bill was refunded or cancelled.
 *
 * The original row is marked REVERSED rather than deleted, and a negative ledger
 * entry is written. Deleting would erase the fact that the reward ever existed,
 * which is precisely what an audit needs to see.
 *
 * If the customer has already spent the points, the reversal cannot complete
 * without a negative balance. Rather than inventing one, the account is flagged
 * for the shopkeeper to review — a debt nobody can explain is worse than a flag
 * somebody can act on.
 */
export async function reverseReferral(input: { referralId: number; reason?: unknown; reversedBy: string }) {
  const reason = typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim().slice(0, 500) : null

  const [referral] = await db.select().from(referralTransactions).where(eq(referralTransactions.id, input.referralId))
  if (!referral) return { error: 'Referral transaction not found.' }
  if (referral.status === 'REVERSED') return { error: 'That referral has already been reversed.' }

  try {
    const result = await db.transaction(async (tx) => {
      const moved = await applyPoints(tx, {
        customerId: referral.referrerCustomerId,
        delta: -referral.pointsEarned,
        type: 'REVERSAL',
        description: `Referral reversal – ${referral.invoiceNumber}${reason ? ` (${reason})` : ''}`,
        createdBy: input.reversedBy,
        referenceId: String(referral.id),
        invoiceNumber: referral.invoiceNumber,
        // Lifetime earned comes back down: the points are no longer earned.
        earnedDelta: -referral.pointsEarned,
      })

      if ('error' in moved) {
        // The points were already spent. Flag rather than force a negative balance.
        await tx
          .update(customers)
          .set({ flaggedForReview: true, updatedAt: new Date() })
          .where(eq(customers.id, referral.referrerCustomerId))
        return { needsReview: true as const, message: moved.error }
      }

      const [updated] = await tx
        .update(referralTransactions)
        .set({
          status: 'REVERSED',
          reversedAt: new Date(),
          reversedBy: input.reversedBy,
          reversalReason: reason,
          updatedBy: input.reversedBy,
          updatedAt: new Date(),
        })
        .where(eq(referralTransactions.id, referral.id))
        .returning()

      return { referral: updated, balanceAfter: moved.balanceAfter, needsReview: false as const }
    })

    if (result.needsReview) {
      return {
        error: `Cannot reverse: the points have already been spent. ${result.message} The customer has been flagged for review.`,
        flagged: true,
      }
    }
    return result
  } catch (error) {
    console.error('[rewards] Failed to reverse referral:', error)
    throw error
  }
}

/**
 * Redeems points against a bill, returning the rupee discount.
 *
 * Called from billing while the invoice is being created. The caller passes its
 * transaction so the deduction and the invoice commit together — if the invoice
 * fails to save, the points are not spent. Deducting first and creating the bill
 * after would silently burn a customer's points on a bill that never existed.
 */
export async function redeemPoints(
  tx: Tx,
  input: { customerId: number; points: number; invoiceNumber: string; createdBy: string },
): Promise<{ discountValue: number; balanceAfter: number; ledgerId: number } | { error: string }> {
  const requested = Math.trunc(input.points)
  if (!Number.isFinite(requested) || requested <= 0) return { error: 'Enter how many points to redeem.' }

  const settings = await getRewardSettings()
  if (settings.minimumPointsToRedeem > 0 && requested < settings.minimumPointsToRedeem) {
    return { error: `At least ${settings.minimumPointsToRedeem} points must be redeemed.` }
  }
  if (settings.maximumPointsPerBill > 0 && requested > settings.maximumPointsPerBill) {
    return { error: `At most ${settings.maximumPointsPerBill} points can be redeemed on one bill.` }
  }

  // applyPoints refuses a negative balance, so an over-redemption is caught here
  // rather than needing a separate check that could drift from the write.
  const moved = await applyPoints(tx, {
    customerId: input.customerId,
    delta: -requested,
    type: 'REDEEMED',
    description: `Points redeemed – ${input.invoiceNumber}`,
    createdBy: input.createdBy,
    invoiceNumber: input.invoiceNumber,
    redeemedDelta: requested,
  })
  if ('error' in moved) return { error: moved.error }

  return {
    discountValue: Math.round(requested * settings.redemptionValuePerPoint),
    balanceAfter: moved.balanceAfter,
    ledgerId: 0,
  }
}

/** Redeems points as a standalone operation, for the customer profile screen. */
export async function redeemPointsForCustomer(input: {
  customerId: number
  points: number
  invoiceNumber?: unknown
  createdBy: string
}) {
  const invoiceNumber = typeof input.invoiceNumber === 'string' && input.invoiceNumber.trim()
    ? input.invoiceNumber.trim().slice(0, 60)
    : `MANUAL-${Date.now().toString(36).toUpperCase()}`
  return db.transaction(async (tx) =>
    redeemPoints(tx, {
      customerId: input.customerId,
      points: input.points,
      invoiceNumber,
      createdBy: input.createdBy,
    }),
  )
}

/**
 * Moves points by hand, with a required reason.
 *
 * The reason is mandatory because an unexplained manual adjustment is the one
 * entry in a ledger nobody can defend six months later. The person who did it is
 * always recorded.
 */
export async function adjustPoints(input: {
  customerId: number
  points: number
  reason: unknown
  createdBy: string
}) {
  const settings = await getRewardSettings()
  if (!settings.allowManualAdjustment) {
    return { error: 'Manual point adjustments are switched off in Rewards settings.' }
  }

  const delta = Math.trunc(Number(input.points))
  if (!Number.isFinite(delta) || delta === 0) return { error: 'Enter a non-zero points value.' }
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (!reason) return { error: 'A reason is required for a manual adjustment.' }

  return db.transaction(async (tx) => {
    const moved = await applyPoints(tx, {
      customerId: input.customerId,
      delta,
      type: 'ADJUSTMENT',
      description: `Manual adjustment: ${reason.slice(0, 400)}`,
      createdBy: input.createdBy,
      earnedDelta: delta > 0 ? delta : 0,
    })
    if ('error' in moved) return moved
    return { balanceAfter: moved.balanceAfter, adjusted: delta }
  })
}

/** The customer's points history, newest first. */
export async function rewardHistory(customerId: number, limit = 100) {
  return db
    .select()
    .from(rewardLedger)
    .where(eq(rewardLedger.customerId, customerId))
    .orderBy(sql`${rewardLedger.createdAt} DESC, ${rewardLedger.id} DESC`)
    .limit(Math.min(Math.max(limit, 1), 500))
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
//
// Built here as plain strings so the wording lives in one place. A WhatsApp or
// SMS sender can be attached later without touching the engine — it only has to
// take the message this returns and deliver it.

export function buildReferralMessage(name: string, points: number, balance: number): string {
  return `Congratulations ${name}! You earned ${points} SML Reward Points from a successful referral purchase at Sri Maha Laxmi Jewellers. Your current balance is ${balance} points. Redeem your points on your next purchase.`
}

export function buildRedemptionMessage(name: string, points: number, value: number, balance: number): string {
  return `${name}, you redeemed ${points} SML Reward Points worth ₹${value} on your purchase. Your remaining balance is ${balance} points. Thank you for shopping with Sri Maha Laxmi Jewellers.`
}