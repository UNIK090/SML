// Invoice delivery.
//
// Three backends behind one interface, so switching is a config change:
//
//   whatsapp_link  (default) — opens WhatsApp with the invoice text pre-filled.
//                              No account, no cost, no approval. The message is
//                              sent by the shopkeeper pressing Send in WhatsApp,
//                              which is why the result is QUEUED, not SENT.
//   twilio         — real WhatsApp or SMS via Twilio. Needs TWILIO_ACCOUNT_SID,
//                              TWILIO_AUTH_TOKEN, TWILIO_FROM.
//   msg91          — real SMS via MSG91 (India). Needs MSG91_AUTH_KEY,
//                              MSG91_SENDER_ID. Commercial SMS in India requires
//                              DLT registration of the sender and templates.
//
// Nothing here runs on the Edge runtime, and nothing is imported by middleware.

import type { ShopDetails } from './shop'

export type Channel = 'whatsapp' | 'sms'

export type SendResult = {
  provider: string
  status: 'QUEUED' | 'SENT' | 'FAILED'
  /** Present for whatsapp_link: the URL the user must open to finish sending. */
  link?: string
  /** Human-readable detail, stored on the send record. */
  detail?: string
  /** True when the provider actually delivered the message. */
  delivered: boolean
}

export type InvoiceMessage = {
  invoiceNumber: string
  customerName: string | null
  shop: ShopDetails
  total: string
  lines: { itemName: string; quantity: number; lineTotal: string }[]
  discount: string
  paymentStatus: string
  businessDay: string
  publicUrl: string | null
}

/**
 * Normalises an Indian phone number to E.164 (+91XXXXXXXXXX).
 * Returns null when the number cannot be a valid Indian mobile, so a typo is
 * caught before a bill is sent to a stranger.
 */
export function normalisePhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, '')
  if (!digits) return null

  // 10 digits: a bare Indian mobile, e.g. 9876543210
  if (digits.length === 10) return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null
  // 12 digits starting 91: 919876543210
  if (digits.length === 12 && digits.startsWith('91')) return /^91[6-9]\d{9}$/.test(digits) ? `+${digits}` : null
  // 11 digits starting 0: 09876543210
  if (digits.length === 11 && digits.startsWith('0')) return /^0[6-9]\d{9}$/.test(digits) ? `+91${digits.slice(1)}` : null

  return null
}

/** Builds the plain-text invoice used for both WhatsApp and SMS. */
export function buildMessage(invoice: InvoiceMessage): string {
  const rupee = (value: string | number) => `Rs.${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const lines = invoice.lines
    .map((line) => `  ${line.itemName} x${line.quantity} = ${rupee(line.lineTotal)}`)
    .join('\n')

  const subtotal = invoice.lines.reduce((sum, line) => sum + Number(line.lineTotal), 0)
  const discount = Number(invoice.discount || 0)

  return [
    `*${invoice.shop.name}*`,
    invoice.shop.address ?? null,
    invoice.shop.phone ? `Phone: ${invoice.shop.phone}` : null,
    invoice.shop.gstin ? `GSTIN: ${invoice.shop.gstin}` : null,
    '',
    `Invoice: ${invoice.invoiceNumber}`,
    `Date: ${invoice.businessDay}`,
    invoice.customerName ? `Customer: ${invoice.customerName}` : null,
    '',
    lines,
    '',
    `Subtotal: ${rupee(subtotal)}`,
    discount > 0 ? `Discount: -${rupee(discount)}` : null,
    `*Total: ${rupee(invoice.total)}*`,
    `Payment: ${invoice.paymentStatus}`,
    '',
    'Thank you for your business.',
    invoice.publicUrl ? `View invoice: ${invoice.publicUrl}` : null,
  ]
    .filter((line) => line !== null)
    .join('\n')
}

/** Which channel/provider the shop has configured. */
export function configuredProvider(channel: Channel): 'whatsapp_link' | 'twilio' | 'msg91' {
  const override = process.env.INVOICE_PROVIDER?.trim()
  if (override === 'twilio' || override === 'msg91' || override === 'whatsapp_link') return override
  return 'whatsapp_link'
}

export function isAutoSendEnabled(): boolean {
  return process.env.INVOICE_AUTO_SEND === 'true'
}

/**
 * Delivers the invoice. With the default provider this does not send anything
 * itself — it returns the URL the shopkeeper opens, because WhatsApp does not
 * permit programmatic sends without a Business API account.
 */
export async function sendInvoice(input: { phone: string; channel: Channel; message: string }): Promise<SendResult> {
  const provider = configuredProvider(input.channel)

  if (provider === 'whatsapp_link') {
    // The link provider can only open WhatsApp. Choosing SMS here would be a
    // silent lie, so it is reported as a failure telling the user what to set up.
    if (input.channel === 'sms') {
      return {
        provider,
        status: 'FAILED',
        detail: 'SMS needs a provider. Set INVOICE_PROVIDER=twilio or msg91 with credentials, or send over WhatsApp.',
        delivered: false,
      }
    }
    const link = `https://wa.me/${input.phone.replace('+', '')}?text=${encodeURIComponent(input.message)}`
    return {
      provider,
      status: 'QUEUED',
      link,
      detail: 'Opened in WhatsApp — press Send there to deliver.',
      delivered: false,
    }
  }

  if (provider === 'twilio') {
    const sid = process.env.TWILIO_ACCOUNT_SID
    const token = process.env.TWILIO_AUTH_TOKEN
    const from = process.env.TWILIO_FROM
    if (!sid || !token || !from) {
      return { provider, status: 'FAILED', detail: 'Twilio credentials are incomplete.', delivered: false }
    }
    try {
      const body = new URLSearchParams({ To: input.phone, From: from, Body: input.message })
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      })
      const result = (await response.json()) as { sid?: string; message?: string }
      if (!response.ok) return { provider, status: 'FAILED', detail: result.message ?? `HTTP ${response.status}`, delivered: false }
      return { provider, status: 'SENT', detail: result.sid ?? 'accepted by Twilio', delivered: true }
    } catch (error) {
      return { provider, status: 'FAILED', detail: error instanceof Error ? error.message : 'Twilio request failed.', delivered: false }
    }
  }

  // MSG91 — SMS only; it has no WhatsApp 1:1 send endpoint.
  const authKey = process.env.MSG91_AUTH_KEY
  const senderId = process.env.MSG91_SENDER_ID
  if (!authKey || !senderId) {
    return { provider, status: 'FAILED', detail: 'MSG91 credentials are incomplete.', delivered: false }
  }
  if (input.channel === 'whatsapp') {
    return { provider, status: 'FAILED', detail: 'MSG91 handles SMS only. Choose SMS or use a WhatsApp provider.', delivered: false }
  }
  try {
    const response = await fetch('https://api.msg91.com/api/v2/sendsms', {
      method: 'POST',
      headers: { authkey: authKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: senderId, route: '4', country: '91', sms: [{ message: input.message, to: [input.phone.replace('+', '')] }] }),
    })
    const text = await response.text()
    if (!response.ok) return { provider, status: 'FAILED', detail: text.slice(0, 300) || `HTTP ${response.status}`, delivered: false }
    return { provider, status: 'SENT', detail: text.slice(0, 300), delivered: true }
  } catch (error) {
    return { provider, status: 'FAILED', detail: error instanceof Error ? error.message : 'MSG91 request failed.', delivered: false }
  }
}
