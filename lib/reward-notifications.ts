// Reward notifications.
//
// The engine already writes the wording (`buildReferralMessage`, `buildRedemptionMessage`);
// this module is the layer that actually gets it to a customer, and the one that
// remembers what was sent.
//
// WHY THIS IS SEPARATE FROM THE ENGINE
//
// Awarding points must never depend on a message being delivered. A customer on
// a bad line, or a shop with no SMS provider configured, still earns their
// points — the reward is the promise, the message is only how they hear about
// it. So the engine commits first and this runs after, and a failure here is
// recorded rather than thrown.
//
// The same `invoice_sends` table backs both invoices and rewards. That is
// deliberate: a shopkeeper asking "did this customer get told about their
// points?" wants one place to look, not two, and the delivery provider, status
// and error are the same information either way.

import { db } from '@/lib/db'
import { invoiceSends } from '@/lib/db/schema'
import { normalisePhone, sendInvoice, type Channel, type SendResult } from '@/lib/messaging'

/**
 * Turns a provider result into the shape the caller reports.
 *
 * Kept as one function so the link, the status and the sentence shown at the
 * counter can never disagree with each other.
 */
function shape(result: SendResult, channel: Channel): RewardDelivery {
  return {
    delivered: result.delivered,
    status: result.status,
    channel,
    link: result.link,
    detail: result.detail ?? (result.delivered ? 'Sent.' : 'Queued.'),
  }
}

/**
 * Records the attempt against the send audit.
 *
 * Written whatever the outcome, because the record is what makes "did this
 * customer get told about their points?" answerable later. Failures are recorded
 * too — a row that only exists on success cannot explain a silent miss.
 */
async function recordSend(
  provider: string,
  channel: Channel,
  phone: string,
  result: SendResult,
  input: { kind: RewardKind; invoiceNumber?: string | null },
) {
  try {
    await db.insert(invoiceSends).values({
      invoiceNumber: input.invoiceNumber ?? `REWARD-${input.kind}`,
      channel,
      provider,
      phone,
      status: result.status,
      response: result.detail ?? null,
    })
  } catch (error) {
    // An audit row that cannot be written must not break the message or the sale.
    console.error('[rewards] Could not record a reward message:', error)
  }
}

/** What kind of reward message is being sent, for the send record. */
export type RewardKind = 'REFERRAL_EARNED' | 'POINTS_REDEEMED'

export type RewardDelivery = {
  /** True when the message was actually handed to a provider. */
  delivered: boolean
  status: SendResult['status']
  channel: Channel | null
  /** For the link-based provider: the URL the shopkeeper opens to finish sending. */
  link?: string
  /** Human-readable outcome, shown at the counter. */
  detail: string
}

/**
 * Sends a reward message to a customer, or explains why it was not sent.
 *
 * Never throws. A notification failing is not a reason to fail the sale or the
 * points credit that preceded it — the caller records the outcome and moves on.
 *
 * When the shop uses the link-based WhatsApp provider (the default, and what most
 * small shops run), nothing is sent automatically: the returned `link` is opened
 * by the shopkeeper, so the status is QUEUED rather than SENT. That distinction
 * is carried through honestly rather than reported as delivered.
 */
export async function sendRewardMessage(input: {
  phone: string | null | undefined
  message: string
  kind: RewardKind
  invoiceNumber?: string | null
  customerName?: string | null
  /** Preferred channel; falls back to whichever provider is configured. */
  channel?: Channel
}): Promise<RewardDelivery> {
  const phone = normalisePhone(String(input.phone ?? ''))
  if (!phone) {
    return { delivered: false, status: 'FAILED', channel: null, detail: 'No valid mobile number on file, so nothing was sent.' }
  }

  const requested: Channel = input.channel ?? 'whatsapp'

  //
  // Hand the message to the same sender the invoice flow uses, and let IT decide
  // what this shop's configuration can do.
  //
  // An earlier version tried to work out the channel here by asking whether a
  // provider was "configured" — and got the answer wrong for the default
  // `whatsapp_link` provider, which reports configured:false because it cannot
  // send automatically. That is true, and beside the point: it CAN produce the
  // link the shopkeeper needs. `sendInvoice` already encodes all of this, so the
  // honest thing is to call it and report what it says.
  //
  const channel: Channel = requested

  try {
    const result = await sendInvoice({ phone, channel, message: input.message })

    // A channel that genuinely cannot work — SMS with no paid provider — is
    // retried over WhatsApp, which the link provider can always prepare.
    if (result.status === 'FAILED' && channel === 'sms') {
      const fallback = await sendInvoice({ phone, channel: 'whatsapp', message: input.message })
      if (fallback.status !== 'FAILED') {
        await recordSend(fallback.provider, 'whatsapp', phone, fallback, input)
        return shape(fallback, 'whatsapp')
      }
    }

    await recordSend(result.provider, channel, phone, result, input)
    return shape(result, channel)
  } catch (error) {
    // Logged, never thrown: the reward is already saved and a failed courtesy
    // message must not undo it.
    console.error('[rewards] Could not send a reward message:', error)
    return { delivered: false, status: 'FAILED', channel, detail: 'The message could not be sent.' }
  }
}

/**
 * Sends a reward message only when the shop has asked for automatic delivery.
 *
 * The default provider is link-based, which cannot auto-send — so in practice
 * this returns the prepared link for the counter to open. Splitting this from
 * `sendRewardMessage` keeps the "should we send at all?" decision in one place.
 */
export async function deliverRewardMessage(input: {
  phone: string | null | undefined
  message: string
  kind: RewardKind
  invoiceNumber?: string | null
  customerName?: string | null
}): Promise<RewardDelivery> {
  return sendRewardMessage(input)
}

/** The reward message for a referral credit, ready to send or show. */
export function referralMessage(name: string, points: number, balance: number): string {
  return `Congratulations ${name}! You earned ${points} SML Reward Points from a successful referral purchase at Sri Maha Laxmi Jewellers. Your current balance is ${balance} points. Redeem your points on your next purchase.`
}

/** The reward message for a redemption, ready to send or show. */
export function redemptionMessage(name: string, points: number, value: number, balance: number): string {
  return `${name}, you redeemed ${points} SML Reward Points worth Rs.${value} on your purchase. Your remaining balance is ${balance} points. Thank you for shopping with Sri Maha Laxmi Jewellers.`
}