// Invoice delivery.
//
// Four backends behind one interface, so switching is a config change:
//
//   whatsapp_link  (default) — opens WhatsApp with the invoice text pre-filled.
//                              No account, no cost, no approval. The message is
//                              sent by the shopkeeper pressing Send in WhatsApp,
//                              which is why the result is QUEUED, not SENT.
//   twilio         — real WhatsApp or SMS via Twilio. Needs TWILIO_ACCOUNT_SID,
//                              TWILIO_AUTH_TOKEN, TWILIO_FROM.
//   meta_whatsapp  — direct WhatsApp Business Cloud API delivery. Needs an
//                              approved one-variable template plus the Meta
//                              access token, phone-number ID and API version.
//   msg91          — real SMS via MSG91 (India). Needs MSG91_AUTH_KEY,
//                              MSG91_SENDER_ID. Commercial SMS in India requires
//                              DLT registration of the sender and templates.
//
// Nothing here runs on the Edge runtime, and nothing is imported by middleware.

import type { ShopDetails } from './shop'

export type Channel = 'whatsapp' | 'sms'
export type InvoiceProvider = 'whatsapp_link' | 'twilio' | 'meta_whatsapp' | 'msg91'

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

export type InvoiceDeliveryStatus = {
  provider: InvoiceProvider
  autoSendEnabled: boolean
  configured: boolean
  automatic: boolean
  detail: string
  setup: string[]
}

export type SmsDeliveryStatus = {
  provider: 'twilio' | 'msg91' | 'none'
  autoSendEnabled: boolean
  configured: boolean
  automatic: boolean
  detail: string
  setup: string[]
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

/**
 * A concise, transactional SMS. It intentionally carries the shop name,
 * contact details, invoice value, and secure receipt link without the full
 * item list, which keeps SMS delivery practical and DLT-template friendly.
 */
export function buildSmsMessage(invoice: InvoiceMessage): string {
  const rupee = `Rs.${Number(invoice.total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const address = invoice.shop.address ? invoice.shop.address.replace(/\s+/g, ' ').slice(0, 120) : null
  const customerName = invoice.customerName?.replace(/\s+/g, ' ').trim() || null
  const storeContact = [
    address ? `Address: ${address}` : null,
    invoice.shop.phone ? `Help: ${invoice.shop.phone}` : null,
  ].filter(Boolean).join(' | ')

  return [
    `${invoice.shop.name} | Invoice receipt`,
    customerName ? `Hello ${customerName},` : null,
    `Invoice: ${invoice.invoiceNumber} | Total: ${rupee}`,
    `Payment status: ${invoice.paymentStatus}`,
    invoice.publicUrl ? `View receipt: ${invoice.publicUrl}` : null,
    storeContact || null,
    'Thank you for shopping with us.',
  ].filter(Boolean).join('\n')
}

/** Which channel/provider the shop has configured. */
export function configuredProvider(channel: Channel): InvoiceProvider {
  if (channel === 'sms') {
    const smsProvider = process.env.SMS_PROVIDER?.trim() ?? process.env.INVOICE_SMS_PROVIDER?.trim()
    if (smsProvider === 'twilio' || smsProvider === 'msg91') return smsProvider
    // Preserve compatibility for shops that previously used INVOICE_PROVIDER
    // directly for SMS.
    const legacy = process.env.INVOICE_PROVIDER?.trim()
    if (legacy === 'twilio' || legacy === 'msg91') return legacy
    return 'whatsapp_link'
  }
  const override = process.env.INVOICE_PROVIDER?.trim()
  if (override === 'twilio' || override === 'msg91' || override === 'whatsapp_link' || override === 'meta_whatsapp') return override
  return 'whatsapp_link'
}

export function isAutoSendEnabled(): boolean {
  return process.env.INVOICE_AUTO_SEND === 'true'
}

export function isAutoSendSmsEnabled(): boolean {
  return process.env.INVOICE_AUTO_SEND_SMS === 'true'
}

function hasTwilioCredentials(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM)
}

function hasMsg91Credentials(): boolean {
  // India transactional SMS requires a DLT-approved sender and template. A
  // template can contain variables for the store details, amount and receipt
  // link, but its static wording must match the registered DLT template.
  return Boolean(process.env.MSG91_AUTH_KEY && process.env.MSG91_SENDER_ID && process.env.MSG91_DLT_TEMPLATE_ID)
}

function hasMetaWhatsAppCredentials(): boolean {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    process.env.WHATSAPP_GRAPH_API_VERSION &&
    process.env.WHATSAPP_TEMPLATE_NAME,
  )
}

/** Safe, non-secret delivery information shown to the administrator. */
export function getInvoiceDeliveryStatus(): InvoiceDeliveryStatus {
  const provider = configuredProvider('whatsapp')
  const autoSendEnabled = isAutoSendEnabled()

  if (provider === 'meta_whatsapp') {
    const configured = hasMetaWhatsAppCredentials()
    return {
      provider,
      autoSendEnabled,
      configured,
      automatic: autoSendEnabled && configured,
      detail: configured
        ? autoSendEnabled
          ? 'Automatic WhatsApp delivery is active.'
          : 'WhatsApp is configured; turn on INVOICE_AUTO_SEND to deliver new invoices automatically.'
        : 'Meta WhatsApp needs an access token, phone-number ID, API version, and approved invoice template.',
      setup: ['INVOICE_PROVIDER=meta_whatsapp', 'INVOICE_AUTO_SEND=true', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_GRAPH_API_VERSION', 'WHATSAPP_TEMPLATE_NAME'],
    }
  }

  if (provider === 'twilio') {
    const configured = hasTwilioCredentials()
    return {
      provider,
      autoSendEnabled,
      configured,
      automatic: autoSendEnabled && configured,
      detail: configured
        ? autoSendEnabled
          ? 'Automatic WhatsApp delivery is active through Twilio.'
          : 'Twilio is configured; turn on INVOICE_AUTO_SEND to deliver new invoices automatically.'
        : 'Twilio needs account, token, and WhatsApp sender credentials.',
      setup: ['INVOICE_PROVIDER=twilio', 'INVOICE_AUTO_SEND=true', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM'],
    }
  }

  if (provider === 'msg91') {
    return {
      provider,
      autoSendEnabled,
      configured: Boolean(process.env.MSG91_AUTH_KEY && process.env.MSG91_SENDER_ID),
      automatic: false,
      detail: 'MSG91 is an SMS provider and cannot automatically deliver WhatsApp invoices.',
      setup: ['Use INVOICE_PROVIDER=meta_whatsapp or twilio for WhatsApp delivery.'],
    }
  }

  return {
    provider,
    autoSendEnabled,
    configured: false,
    automatic: false,
    detail: 'The WhatsApp link opens a prepared message, but a person must press Send. Connect Meta WhatsApp or Twilio for automatic delivery.',
    setup: ['INVOICE_PROVIDER=meta_whatsapp', 'INVOICE_AUTO_SEND=true', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_GRAPH_API_VERSION', 'WHATSAPP_TEMPLATE_NAME'],
  }
}

/** Safe, non-secret status of direct invoice SMS for the Profile screen. */
export function getSmsDeliveryStatus(): SmsDeliveryStatus {
  const raw = configuredProvider('sms')
  const provider = raw === 'twilio' || raw === 'msg91' ? raw : 'none'
  const autoSendEnabled = isAutoSendSmsEnabled()

  if (provider === 'twilio') {
    const configured = hasTwilioCredentials()
    return {
      provider,
      autoSendEnabled,
      configured,
      automatic: autoSendEnabled && configured,
      detail: configured
        ? autoSendEnabled ? 'Automatic SMS invoice delivery is active through Twilio.' : 'Twilio SMS is ready. Turn on INVOICE_AUTO_SEND_SMS to send each new invoice directly.'
        : 'Twilio SMS needs account, token, and an approved SMS sender.',
      setup: ['SMS_PROVIDER=twilio', 'INVOICE_AUTO_SEND_SMS=true', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM'],
    }
  }

  if (provider === 'msg91') {
    const configured = hasMsg91Credentials()
    return {
      provider,
      autoSendEnabled,
      configured,
      automatic: autoSendEnabled && configured,
      detail: configured
        ? autoSendEnabled ? 'Automatic SMS invoice delivery is active through MSG91.' : 'MSG91 SMS is ready. Turn on INVOICE_AUTO_SEND_SMS to send each new invoice directly.'
        : 'MSG91 needs the auth key, DLT-approved sender ID, and DLT template ID for India SMS.',
      setup: ['SMS_PROVIDER=msg91', 'INVOICE_AUTO_SEND_SMS=true', 'MSG91_AUTH_KEY', 'MSG91_SENDER_ID', 'MSG91_DLT_TEMPLATE_ID'],
    }
  }

  return {
    provider: 'none',
    autoSendEnabled,
    configured: false,
    automatic: false,
    detail: 'Connect MSG91 or Twilio to send invoice links and shop details directly by SMS.',
    setup: ['SMS_PROVIDER=msg91', 'INVOICE_AUTO_SEND_SMS=true', 'MSG91_AUTH_KEY', 'MSG91_SENDER_ID', 'MSG91_DLT_TEMPLATE_ID'],
  }
}

export function canAutoSendInvoices(): boolean {
  return getInvoiceDeliveryStatus().automatic
}

export function canAutoSendSmsInvoices(): boolean {
  return getSmsDeliveryStatus().automatic
}

function templateBody(message: string): string {
  // A Meta template body variable is limited. Preserve the receipt link when a
  // particularly long multi-item bill must be shortened.
  if (message.length <= 1_024) return message
  const receipt = message.split('\n').find((line) => line.startsWith('View invoice:'))
  return `${message.slice(0, 900).trimEnd()}…${receipt ? `\n${receipt}` : ''}`
}

async function sendMetaWhatsApp(input: { phone: string; message: string }): Promise<SendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const version = process.env.WHATSAPP_GRAPH_API_VERSION?.trim()
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME?.trim()
  const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || 'en_US'

  if (!token || !phoneNumberId || !version || !templateName) {
    return {
      provider: 'meta_whatsapp',
      status: 'FAILED',
      detail: 'Meta WhatsApp is incomplete. Set the access token, phone-number ID, Graph API version, and approved template name.',
      delivered: false,
    }
  }
  if (!/^v\d+\.\d+$/.test(version)) {
    return { provider: 'meta_whatsapp', status: 'FAILED', detail: 'WHATSAPP_GRAPH_API_VERSION must look like vNN.N.', delivered: false }
  }

  try {
    const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: input.phone.replace('+', ''),
        type: 'template',
        template: {
          name: templateName,
          language: { code: language },
          // Create a template whose body contains exactly {{1}}. The app puts
          // the complete receipt summary and secure QR receipt URL into it.
          components: [{ type: 'body', parameters: [{ type: 'text', text: templateBody(input.message) }] }],
        },
      }),
    })
    const result = (await response.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { message?: string } }
    if (!response.ok) return { provider: 'meta_whatsapp', status: 'FAILED', detail: result.error?.message ?? `HTTP ${response.status}`, delivered: false }
    return { provider: 'meta_whatsapp', status: 'SENT', detail: result.messages?.[0]?.id ?? 'accepted by Meta WhatsApp', delivered: true }
  } catch (error) {
    return { provider: 'meta_whatsapp', status: 'FAILED', detail: error instanceof Error ? error.message : 'Meta WhatsApp request failed.', delivered: false }
  }
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

  if (provider === 'meta_whatsapp') {
    if (input.channel !== 'whatsapp') {
      return { provider, status: 'FAILED', detail: 'Meta WhatsApp delivers WhatsApp only.', delivered: false }
    }
    return sendMetaWhatsApp(input)
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
  const dltTemplateId = process.env.MSG91_DLT_TEMPLATE_ID
  if (!authKey || !senderId || !dltTemplateId) {
    return { provider, status: 'FAILED', detail: 'MSG91 SMS needs the auth key, DLT-approved sender ID, and DLT template ID.', delivered: false }
  }
  if (input.channel === 'whatsapp') {
    return { provider, status: 'FAILED', detail: 'MSG91 handles SMS only. Choose SMS or use a WhatsApp provider.', delivered: false }
  }
  try {
    const response = await fetch('https://api.msg91.com/api/v2/sendsms', {
      method: 'POST',
      headers: { authkey: authKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: senderId, route: '4', country: '91', DLT_TE_ID: dltTemplateId, sms: [{ message: input.message, to: [input.phone.replace('+', '')] }] }),
    })
    const text = await response.text()
    if (!response.ok) return { provider, status: 'FAILED', detail: text.slice(0, 300) || `HTTP ${response.status}`, delivered: false }
    return { provider, status: 'SENT', detail: text.slice(0, 300), delivered: true }
  } catch (error) {
    return { provider, status: 'FAILED', detail: error instanceof Error ? error.message : 'MSG91 request failed.', delivered: false }
  }
}
