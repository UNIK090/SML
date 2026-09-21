'use client'

// Printable invoice, shown as a modal over any section.
//
// Extracted from the old dashboard so the invoice can be opened from Billing or
// Payments without duplicating the markup.

import { useEffect, useState } from 'react'
import { Loader2, Send, X } from 'lucide-react'
import QRCode from 'qrcode'
import { Button, Field, Input, Notice, money } from '@/components/ui'
import { usePreferences } from '@/components/preferences'
import PrintInvoiceButton from '@/components/print-invoice-button'
import type { Invoice, Shop } from '@/lib/types'

export default function InvoiceModal({
  invoice,
  shop,
  hasLogo,
  logoVersion,
  onClose,
}: {
  invoice: Invoice
  shop: Shop | null
  hasLogo: boolean
  logoVersion: string | number
  onClose: () => void
}) {
  const { t } = usePreferences()
  const [phone, setPhone] = useState(invoice.customerPhone ?? '')
  const [sending, setSending] = useState<'whatsapp' | 'sms' | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [receiptUrl, setReceiptUrl] = useState('')
  const [qrCode, setQrCode] = useState('')

  const lines = invoice.lines ?? []
  const subtotal = lines.reduce((sum, line) => sum + Number(line.lineTotal), 0)
  const discount = Number(invoice.discount || 0)
  const hasShopDetails = Boolean(shop?.address || shop?.phone || shop?.email || shop?.gstin)

  useEffect(() => {
    if (!invoice.publicToken) return
    const url = `${window.location.origin}/invoice/${invoice.publicToken}`
    let active = true
    setReceiptUrl(url)
    void QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 180,
      color: { dark: '#172033', light: '#ffffff' },
    }).then((value) => { if (active) setQrCode(value) }).catch(() => { if (active) setQrCode('') })
    return () => { active = false }
  }, [invoice.publicToken])

  const send = async (channel: 'whatsapp' | 'sms') => {
    setSending(channel)
    setNote('')
    setError('')
    try {
      const response = await fetch('/api/invoice/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceNumber: invoice.invoiceNumber, channel, phone }),
      })
      const text = await response.text()
      const result = text ? JSON.parse(text) : {}
      if (!response.ok) {
        setError(result.error ?? 'Could not send the invoice.')
        return
      }
      if (result.link) {
        window.open(result.link, '_blank', 'noopener')
        setNote(`WhatsApp opened for this customer — press Send there to deliver. (${result.provider})`)
      } else if (result.status === 'SENT') {
        setNote(`Invoice delivered by ${result.provider}.`)
      } else {
        setError(result.detail ?? 'The invoice could not be delivered.')
      }
    } catch {
      setError('Could not send the invoice.')
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="invoice-print-root fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 py-8 backdrop-blur-md sm:py-10">
      <div className="invoice-print-sheet receipt-modal business-invoice w-full max-w-xl rounded-3xl border-hairline bg-card p-6 sm:p-7">
        <div className="flex items-start justify-between print:hidden">
          <p className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">{t('invoice.tax')}</p>
          <button aria-label="Close invoice" onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        {/* Invoice head — this block is what prints. */}
        <div className="mt-5 border-b border-hairline pb-5 text-center">
          {hasLogo && <img src={`/api/brand?kind=logo&v=${encodeURIComponent(String(logoVersion))}`} alt="" className="mx-auto mb-3 max-h-20 object-contain" />}
          <h2 className="text-xl font-semibold tracking-tight">{(shop?.name ?? 'SRI MAHA LAXMI JEWELLERS').toUpperCase()}</h2>
          {shop?.address && <p className="mt-1 text-xs text-muted-foreground">{shop.address}</p>}
          {(shop?.phone || shop?.email) && (
            <p className="mt-0.5 text-xs text-muted-foreground">{[shop?.phone, shop?.email].filter(Boolean).join(' · ')}</p>
          )}
          {shop?.gstin && <p className="mt-0.5 text-xs text-muted-foreground">GSTIN: {shop.gstin}</p>}
          {!hasShopDetails && <p className="mt-1 text-xs text-muted-foreground/70">{t('invoice.shopHint')}</p>}
        </div>

        <div className="mt-4 grid gap-1.5 rounded-2xl bg-secondary/50 p-3 text-xs sm:grid-cols-2">
          <p><span className="text-muted-foreground">{t('invoice.number')}</span> <span className="font-medium">{invoice.invoiceNumber}</span></p>
          <p className="sm:text-right"><span className="text-muted-foreground">{t('invoice.date')}</span> <span className="font-medium">{invoice.businessDay}</span></p>
          <p><span className="text-muted-foreground">{t('invoice.customer')}</span> <span className="font-medium">{invoice.customerName || t('common.walkIn')}</span></p>
          {invoice.customerPhone && <p className="sm:text-right"><span className="text-muted-foreground">{t('invoice.phone')}</span> <span className="font-medium">{invoice.customerPhone}</span></p>}
          <p><span className="text-muted-foreground">{t('invoice.payment')}</span> <span className="font-medium">{invoice.paymentStatus}</span></p>
          <p className="sm:text-right"><span className="text-muted-foreground">{t('invoice.time')}</span> <span className="font-medium">{new Date(invoice.createdAt).toLocaleTimeString('en-IN')}</span></p>
        </div>

        <table className="mt-5 w-full text-left text-xs">
          <thead>
            <tr className="border-y border-hairline text-muted-foreground">
              <th className="py-2 font-medium">{t('invoice.col.item')}</th>
              <th className="py-2 text-center font-medium">{t('invoice.col.qty')}</th>
              <th className="py-2 text-right font-medium">{t('invoice.col.rate')}</th>
              <th className="py-2 text-right font-medium">{t('invoice.col.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-hairline">
                <td className="py-2">
                  <span className="font-medium">{line.itemName}</span>
                  <span className="ml-1 text-muted-foreground">({line.category})</span>
                </td>
                <td className="py-2 text-center">{line.quantity}</td>
                <td className="tnum py-2 text-right">{money(Number(line.unitPrice))}</td>
                <td className="tnum py-2 text-right font-medium">{money(Number(line.lineTotal))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex-col items-end gap-1 text-sm">
          <div className="tnum flex w-full max-w-xs justify-between text-muted-foreground">
            <span>{t('common.subtotal')}</span>
            <span>{money(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="tnum flex w-full max-w-xs justify-between text-muted-foreground">
              <span>{t('common.discount')}</span>
              <span>− {money(discount)}</span>
            </div>
          )}
          <div className="tnum flex w-full max-w-xs justify-between border-t border-hairline pt-1.5 text-base font-semibold">
            <span>{t('common.total')}</span>
            <span>{money(Number(invoice.totalAmount))}</span>
          </div>
        </div>

        {qrCode && receiptUrl && (
          <div className="mt-6 flex items-center justify-center gap-4 rounded-2xl border border-dashed border-hairline bg-background/60 p-4 text-left">
            <img src={qrCode} alt={t('invoice.qr.title')} width={112} height={112} className="size-28 rounded-lg bg-white p-1" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{t('invoice.qr.title')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('invoice.qr.hint')}</p>
              <a href={receiptUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block break-all text-xs font-medium text-gold-deep underline print:hidden">{receiptUrl}</a>
            </div>
          </div>
        )}

        <p className="mt-5 text-center text-xs text-muted-foreground/70">{t('invoice.thanks')}</p>

        <div className="mt-6 rounded-2xl border-hairline bg-background/70 p-4 print:hidden">
          <p className="text-sm font-semibold">{t('invoice.send.title')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('invoice.send.hint')}</p>
          <div className="mt-3">
            <Field label={t('invoice.send.mobile')}>
              <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="10-digit mobile, e.g. 9876543210" inputMode="numeric" />
            </Field>
          </div>
          {!phone.trim() && <p className="mt-2 text-xs text-warn">{t('invoice.send.noPhone')}</p>}
          <div className="mt-3 flex gap-2">
            <Button variant="success" onClick={() => send('whatsapp')} disabled={sending !== null} className="flex-1">
              {sending === 'whatsapp' ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              {t('invoice.send.whatsapp')}
            </Button>
            <Button variant="outline" onClick={() => send('sms')} disabled={sending !== null}>
              {sending === 'sms' ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              SMS
            </Button>
          </div>
          {note && <div className="mt-2"><Notice tone="success">{note}</Notice></div>}
          {error && <div className="mt-2"><Notice tone="danger">{error}</Notice></div>}
        </div>

        <div className="mt-4 print:hidden">
          <p className="mb-2 text-center text-xs text-muted-foreground">{t('invoice.print.hint')}</p>
          <PrintInvoiceButton className="w-full" />
        </div>
      </div>
    </div>
  )
}
