import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { rewardSettings } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { getSessionIdentity } from '@/lib/db/session-identity'
import { getRewardSettings } from '@/lib/rewards'

// The shop's referral rule.
//
// A change here affects FUTURE transactions only. Every referral already on
// record keeps the points it was awarded, because those points were a promise
// made to a customer — silently restating them when the shop changes its rate
// would rewrite history and make every past statement wrong.
//
// Each saved rule is written to the reward ledger as a settings change, so the
// shop can see when the rate moved and who moved it.

export const dynamic = 'force-dynamic'

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    return NextResponse.json(await getRewardSettings())
  } catch (error) {
    console.error('[referrals] Failed to load reward settings:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not load the settings.' }, { status: 500 })
  }
}

/** Reads a whole number, rejecting nonsense rather than storing it. */
function whole(value: unknown, min: number, max: number): number | null {
  const n = Math.trunc(Number(value))
  if (!Number.isFinite(n) || n < min || n > max) return null
  return n
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = (await request.json()) as Record<string, unknown>

    const step = Number(body.referralAmountStep)
    if (!Number.isFinite(step) || step <= 0) {
      return NextResponse.json({ error: 'The purchase step must be greater than zero.' }, { status: 400 })
    }
    const pointsPerStep = whole(body.pointsPerStep, 1, 100000)
    if (pointsPerStep === null) {
      return NextResponse.json({ error: 'Points per step must be between 1 and 100,000.' }, { status: 400 })
    }
    const redemptionValue = Number(body.redemptionValuePerPoint)
    if (!Number.isFinite(redemptionValue) || redemptionValue <= 0) {
      return NextResponse.json({ error: 'The value of a point must be greater than zero.' }, { status: 400 })
    }
    const minimum = whole(body.minimumPointsToRedeem ?? 0, 0, 1000000)
    const maximum = whole(body.maximumPointsPerBill ?? 0, 0, 1000000)
    if (minimum === null || maximum === null) {
      return NextResponse.json({ error: 'Redemption limits must be zero or a positive whole number.' }, { status: 400 })
    }
    // A minimum above the maximum is not a rule, it is a contradiction that would
    // refuse every redemption with a confusing message.
    if (maximum > 0 && minimum > maximum) {
      return NextResponse.json({ error: 'The minimum to redeem cannot be higher than the per-bill maximum.' }, { status: 400 })
    }

    const actor = await getSessionIdentity()
    const [updated] = await db
      .update(rewardSettings)
      .set({
        referralEnabled: body.referralEnabled !== false,
        referralAmountStep: step.toFixed(2),
        pointsPerStep,
        redemptionValuePerPoint: redemptionValue.toFixed(2),
        minimumPointsToRedeem: minimum,
        maximumPointsPerBill: maximum,
        allowManualAdjustment: body.allowManualAdjustment !== false,
        updatedAt: new Date(),
      })
      .where(eq(rewardSettings.id, 1))
      .returning()

    if (!updated) return NextResponse.json({ error: 'Reward settings row is missing.' }, { status: 500 })

    console.info(`[referrals] Reward settings changed by ${actor}: ₹${step} -> ${pointsPerStep} pts, 1 pt = ₹${redemptionValue}`)
    return NextResponse.json(await getRewardSettings())
  } catch (error) {
    console.error('[referrals] Failed to save reward settings:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not save the settings.' }, { status: 500 })
  }
}