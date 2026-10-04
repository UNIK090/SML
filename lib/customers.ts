// Customer records, and the referral numbers that hang off them.
//
// THE ONE IDEA THIS FILE EXISTS TO PROTECT
//
// A reward belongs to a person, not to a bill. Before this module the system had
// no person: a name and a phone were typed onto each invoice as free text, so the
// same customer buying twice left two unrelated strings behind and there was
// nothing to attach points to.
//
// So the job here is narrow and important — turn "a name and a phone typed at the
// counter" into "a stable customer row", exactly once, no matter how many people
// do it at the same moment. Everything the referral programme later does (credit
// points, redeem points, reverse a referral) is addressed to a customer id, and
// that id is only trustworthy because this file makes it so.

import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers } from '@/lib/db/schema'
import type { Customer } from '@/lib/types'

/** Where referral numbers start counting. SML10001 is the first real customer. */
const REFERRAL_CODE_BASE = 10000

/**
 * Reduces any phone formatting to the 10 digits this system matches on.
 *
 * The shop writes a number differently every time — "98765 43210", "+91 98765
 * 43210", "098765-43210" — and all three are the same person. Matching on the
 * raw string would create three customers with three referral numbers for one
 * human, which is precisely the bug this function prevents.
 *
 * Returns null when the value cannot be a valid Indian mobile, so a typo is
 * caught at the counter rather than silently becoming a customer nobody can
 * find later. The rule (first digit 6–9, ten digits total) is the same one
 * `lib/messaging.ts` applies before sending a bill, kept consistent so a number
 * that can receive an invoice is exactly a number that can earn points.
 */
export function normaliseCustomerPhone(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const digits = input.replace(/\D/g, '')
  if (!digits) return null

  // 10 digits: a bare Indian mobile, e.g. 9876543210
  if (digits.length === 10) return /^[6-9]\d{9}$/.test(digits) ? digits : null
  // 12 digits starting 91: 919876543210
  if (digits.length === 12 && digits.startsWith('91')) {
    const local = digits.slice(2)
    return /^[6-9]\d{9}$/.test(local) ? local : null
  }
  // 11 digits starting 0: 09876543210
  if (digits.length === 11 && digits.startsWith('0')) {
    const local = digits.slice(1)
    return /^[6-9]\d{9}$/.test(local) ? local : null
  }

  return null
}

/**
 * Reserves the next referral number.
 *
 * The counter lives in a single-row table and is advanced with `UPDATE ... SET
 * last_seq = last_seq + 1 ... RETURNING`, which takes a row lock for the
 * duration. Two staff members saving a customer at the same instant therefore
 * queue rather than both reading 10005 and both issuing SML10005 — the second
 * waits, then gets 10006.
 *
 * Doing this in application code instead (read the max, add one, insert) is the
 * classic race that hands two people the same referral number, and a duplicated
 * referral number means two customers' points land in one account.
 */
async function reserveReferralCode(tx: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]): Promise<string> {
  const result = await tx.execute(sql`
    UPDATE referral_code_sequence
    SET last_seq = last_seq + 1
    WHERE id = 1
    RETURNING last_seq
  `)

  const rows = (result as unknown as { rows?: { last_seq: number }[] }).rows ?? []
  const next = rows[0]?.last_seq

  // The sequence row is created by the migration. If it is somehow missing we
  // fail loudly rather than inventing a number that might already be taken.
  if (typeof next !== 'number') {
    throw new Error('referral_code_sequence is missing its row; cannot issue a referral number.')
  }

  return `SML${String(next).padStart(5, '0')}`
}

/** True when two rows are the same person, as far as this system can tell. */
function sameCustomer(a: Customer, name: string, phone: string): boolean {
  return a.phone === phone && a.name.trim().toLowerCase() === name.trim().toLowerCase()
}

/**
 * Finds the customer for a phone number, creating them if this is their first
 * visit.
 *
 * This is the single entry point billing uses, and it is deliberately the only
 * way a customer is created outside the backfill. One path means one place where
 * a referral number is issued, and one place to reason about when asking "could
 * this customer have been created twice?".
 *
 * Behaviour worth knowing:
 *
 *   · an unknown phone creates a customer and issues a referral number
 *   · a known phone returns the existing customer, and does NOT overwrite their
 *     name — staff spelling a name differently on a second visit must not rename
 *     the account, because the name is how the shopkeeper recognises them later
 *   · an unusable phone returns null rather than throwing, so a walk-in bill
 *     without a number still saves normally
 *   · a race between two simultaneous saves is resolved by the unique index on
 *     `phone`: the loser of the race reads back the winner's row instead of
 *     failing
 */
export async function findOrCreateCustomer(input: {
  name: unknown
  phone: unknown
}): Promise<{ customer: Customer; created: boolean } | { error: string }> {
  const phone = normaliseCustomerPhone(input.phone)
  if (!phone) {
    return { error: 'Enter a valid 10-digit Indian mobile number (starting 6–9).' }
  }

  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 120) : ''
  if (!name) return { error: 'Enter the customer name.' }

  const existing = await findCustomerByPhone(phone)
  if (existing) return { customer: existing, created: false }

  // A new customer. The insert and the code reservation share a transaction so a
  // failure cannot burn a referral number or leave a customer without one.
  try {
    const created = await db.transaction(async (tx) => {
      const referralCode = await reserveReferralCode(tx)
      const [row] = await tx
        .insert(customers)
        .values({
          name,
          phone,
          phoneDisplay: typeof input.phone === 'string' ? input.phone.trim().slice(0, 40) : null,
          referralCode,
        })
        .returning()
      return row
    })
    return { customer: created, created: true }
  } catch (error) {
    // Two saves for the same new phone raced, and this one lost on the unique
    // index. The winner's row is what the caller wanted all along, so read it
    // back rather than surfacing a constraint violation to the counter staff.
    const raced = await findCustomerByPhone(phone)
    if (raced) return { customer: raced, created: false }
    throw error
  }
}

/** The customer for a normalised phone, or null. */
export async function findCustomerByPhone(phone: string): Promise<Customer | null> {
  const [row] = await db.select().from(customers).where(eq(customers.phone, phone))
  return row ?? null
}

/**
 * The customer a referral number belongs to, or null.
 *
 * Accepts the code in any case and with surrounding spaces, because it will be
 * typed from a card or read down a phone line — "sml10245" is the same person as
 * "SML10245" and refusing it would just make the counter staff retype it.
 */
export async function findCustomerByReferralCode(code: unknown): Promise<Customer | null> {
  if (typeof code !== 'string') return null
  const cleaned = code.trim().toUpperCase()
  if (!cleaned) return null
  const [row] = await db.select().from(customers).where(eq(customers.referralCode, cleaned))
  return row ?? null
}

/**
 * Points earned by a bill, given the shop's current rule.
 *
 * Kept as a pure function of the settings so the rule is never hardcoded: the
 * shop can change "₹500 → 30 points" in Settings and every future bill follows
 * it, while every past transaction keeps the number it was actually awarded.
 *
 * Whole blocks only. ₹999 earns the same as ₹500 — the shop chose a step, not a
 * rate, and rounding a part-block up would pay out on money never spent.
 */
export function pointsForBill(billAmount: number, settings: { referralAmountStep: number; pointsPerStep: number }): number {
  const step = Math.floor(Number(settings.referralAmountStep))
  const perStep = Math.floor(Number(settings.pointsPerStep))
  const amount = Number(billAmount)

  if (!Number.isFinite(amount) || amount <= 0) return 0
  if (!Number.isFinite(step) || step <= 0) return 0
  if (!Number.isFinite(perStep) || perStep <= 0) return 0

  return Math.floor(amount / step) * perStep
}

export { REFERRAL_CODE_BASE, sameCustomer }