'use client'

// Add Referral Purchase — the primary action of the whole programme.
//
// The shape of this screen follows the conversation at the counter. A customer
// hands over a bill and a referral number; the staff member types the number and
// the system answers with a name, so they can check it is the right person before
// any points move. That check matters: the number is easy to mistype, and a
// credit that lands in the wrong account is money given to a stranger.
//
// The points are calculated twice on purpose. The server previews them as the
// amount is typed, and the server calculates them again when the button is
// pressed. The figure shown is never sent back as truth — the browser is only
// ever allowed to display a number the server produced.

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowRight, BadgeCheck, Gift, Loader2, Sparkles, X } from 'lucide-react'
import { Button, Field, Input, Notice, money } from '@/components/ui'
import { businessDate } from '@/lib/business-time'

type Referrer = {
  id: number
  name: string
  phone: string
  phoneDisplay: string | null
  referralCode: string
  rewardPoints: number
  active: boolean
}

type Preview = {
  referrer: Referrer
  pointsEarned: number
  settings: { referralAmountStep: number; pointsPerStep: number; redemptionValuePerPoint: number }
}

export default function AddReferralModal({
  onClose,
  onCredited,
}: {
  onClose: () => void
  /** Called with the success sentence once the credit is saved. */
  onCredited: (message: string) => void
}) {
  const [code, setCode] = useState('')
  const [form, setForm] = useState({
    referredCustomerName: '',
    referredCustomerPhone: '',
    invoiceNumber: '',
    billAmount: '',
    purchaseDate: businessDate(),
    notes: '',
  })

  const [preview, setPreview] = useState<Preview | null>(null)
  const [looking, setLooking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  // Escape closes the dialog, as everywhere else in the workspace.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }))

  // The lookup is debounced so a referral number typed one character at a time
  // does not fire a request per keystroke — a staff member on a slow connection
  // would otherwise watch the panel flicker through every prefix of the code.
  const timer = useRef<number | null>(null)
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    const trimmed = code.trim()

    if (!trimmed) {
      setPreview(null)
      setError('')
      return
    }

    timer.current = window.setTimeout(async () => {
      setLooking(true)
      setError('')
      try {
        const response = await fetch('/api/referrals/credit', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ referralCode: trimmed, billAmount: Number(form.billAmount) || 0 }),
        })
        const result = (await response.json()) as Preview & { error?: string }
        if (!response.ok) {
          setPreview(null)
          setError(result.error ?? 'That referral number was not found.')
          return
        }
        setPreview(result)
      } catch {
        setPreview(null)
        setError('Could not reach the server.')
      } finally {
        setLooking(false)
      }
    }, 350)

    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [code, form.billAmount])

  const points = preview?.pointsEarned ?? 0
  const amount = Number(form.billAmount) || 0
  const canConfirm = Boolean(preview) && points > 0 && form.invoiceNumber.trim() !== '' && !saving

  const submit = useCallback(async () => {
    if (!preview || saving) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/referrals/credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referralCode: preview.referrer.referralCode,
          referredCustomerName: form.referredCustomerName,
          referredCustomerPhone: form.referredCustomerPhone,
          invoiceNumber: form.invoiceNumber,
          billAmount: amount,
          purchaseDate: form.purchaseDate,
          notes: form.notes,
        }),
      })
      const result = (await response.json()) as {
        error?: string
        pointsEarned?: number
        balanceAfter?: number
        referrer?: { name: string }
        notification?: string
        delivery?: { link?: string; detail?: string; delivered?: boolean; status?: string }
      }
      if (!response.ok) {
        setError(result.error ?? 'Could not save the referral.')
        setConfirming(false)
        return
      }

      //
      // Open WhatsApp with the congratulations message pre-filled, exactly as the
      // invoice flow does. The link provider cannot send programmatically, so the
      // shopkeeper presses Send — and when a real provider IS configured the
      // message has already gone, so no tab is opened.
      //
      if (result.delivery?.link) {
        window.open(result.delivery.link, '_blank', 'noopener')
      }

      const sent = result.delivery?.delivered
        ? ' The customer has been messaged.'
        : result.delivery?.link
          ? ' WhatsApp opened to send them the good news.'
          : ''

      onCredited(
        `${result.pointsEarned} points credited to ${result.referrer?.name ?? preview.referrer.name}. Their balance is now ${result.balanceAfter} points.${sent}`,
      )
    } catch {
      setError('Could not reach the server. Please try again.')
      setConfirming(false)
    } finally {
      setSaving(false)
    }
  }, [preview, form, amount, saving, onCredited])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm sm:items-center">
      <div role="dialog" aria-modal="true" aria-label="Add referral purchase" className="my-auto w-full max-w-2xl rounded-3xl border-hairline bg-card shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.16em] text-gold-deep uppercase">Reward points</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">Add Referral Purchase</h2>
            <p className="mt-1 text-xs text-muted-foreground">Enter the referral number, then the bill it should be credited against.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex size-8 shrink-0 items-center justify-center rounded-full transition hover:bg-secondary">
            <X className="size-4" />
          </button>
        </header>

        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
          {/* --- The referral number, and the name it resolves to ------------ */}
          <Field label="Referral number" hint="Printed on the customer's card — e.g. SML10245">
            <div className="relative">
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="SML10245"
                className="pr-10 font-semibold tracking-wide"
                autoFocus
                aria-label="Referral number"
              />
              {looking && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
            </div>
          </Field>

          {preview && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border-hairline bg-gold-soft/70 px-4 py-3">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-gold-deep">
                <BadgeCheck className="size-4" /> {preview.referrer.name}
              </span>
              <span className="tnum text-xs text-muted-foreground">{preview.referrer.phoneDisplay ?? preview.referrer.phone}</span>
              <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="size-3.5 text-gold-deep" />
                Current balance <strong className="tnum text-gold-deep">{preview.referrer.rewardPoints}</strong> points
              </span>
            </div>
          )}

          {/* --- The purchase ------------------------------------------------- */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bill amount (₹)" hint={`${money(preview?.settings.referralAmountStep ?? 500)} earns ${preview?.settings.pointsPerStep ?? 30} points`}>
              <Input
                type="number"
                min="0"
                step="1"
                value={form.billAmount}
                onChange={(event) => set({ billAmount: event.target.value })}
                placeholder="1500"
                aria-label="Bill amount"
              />
            </Field>

            <Field label="Bill / invoice number" hint="The same bill cannot earn points twice">
              <Input
                value={form.invoiceNumber}
                onChange={(event) => set({ invoiceNumber: event.target.value })}
                placeholder="SML-INV-2045"
                aria-label="Invoice number"
              />
            </Field>

            <Field label="Referred customer name">
              <Input
                value={form.referredCustomerName}
                onChange={(event) => set({ referredCustomerName: event.target.value })}
                placeholder="e.g. Rahul"
                aria-label="Referred customer name"
              />
            </Field>

            <Field label="Referred customer mobile" hint="Used to stop a customer referring themselves">
              <Input
                value={form.referredCustomerPhone}
                onChange={(event) => set({ referredCustomerPhone: event.target.value })}
                placeholder="e.g. 98765 43210"
                inputMode="tel"
                aria-label="Referred customer mobile"
              />
            </Field>

            <Field label="Purchase date">
              <Input type="date" value={form.purchaseDate} onChange={(event) => set({ purchaseDate: event.target.value })} aria-label="Purchase date" />
            </Field>

            <Field label="Notes (optional)">
              <Input value={form.notes} onChange={(event) => set({ notes: event.target.value })} placeholder="e.g. Diwali purchase" aria-label="Notes" />
            </Field>
          </div>

          {/*
            The calculation, shown before anything is committed. This is the one
            line the staff member reads back to the customer, so it is given the
            weight of a heading rather than tucked into a summary row.
          */}
          {preview && amount > 0 && (
            <div className="rounded-2xl border border-dashed border-gold bg-gold-soft/60 px-4 py-3">
              <p className="text-xs text-gold-deep">
                {money(amount)} ÷ {money(preview.settings.referralAmountStep)} ={' '}
                {Math.floor(amount / preview.settings.referralAmountStep)} completed block
                {Math.floor(amount / preview.settings.referralAmountStep) === 1 ? '' : 's'}
              </p>
              <p className="mt-1 text-sm font-semibold text-gold-deep">
                {preview.referrer.name} will earn {points} reward point{points === 1 ? '' : 's'}.
              </p>
              {points === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Below the first {money(preview.settings.referralAmountStep)} block, so no points are due on this bill.
                </p>
              )}
            </div>
          )}

          {error && (
            <Notice tone="danger">
              <span className="flex items-center gap-2">
                <AlertCircle className="size-3.5" /> {error}
              </span>
            </Notice>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline px-5 py-4 sm:px-6">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gold" disabled={!canConfirm} onClick={() => setConfirming(true)}>
            Review and credit <ArrowRight className="size-4" />
          </Button>
        </footer>
      </div>

      {/* --- The confirmation, restating exactly what will be saved ---------- */}
      {confirming && preview && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div role="alertdialog" aria-modal="true" aria-label="Confirm referral credit" className="w-full max-w-md rounded-3xl border-hairline bg-card p-6 shadow-2xl">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-gold-soft text-gold-deep">
              <Gift className="size-5" />
            </span>
            <h3 className="mt-4 text-lg font-semibold tracking-tight">Credit {points} points?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              This cannot be undone from here. If the bill is later refunded, reverse the referral instead of deleting it.
            </p>

            <dl className="mt-5 flex flex-col gap-2 rounded-2xl bg-secondary/70 px-4 py-3 text-sm">
              {[
                ['Referral number', preview.referrer.referralCode],
                ['Referrer', preview.referrer.name],
                ['Referred customer', form.referredCustomerName || 'Walk-in customer'],
                ['Invoice', form.invoiceNumber],
                ['Bill amount', money(amount)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-medium">{value}</dd>
                </div>
              ))}
              <div className="mt-1 flex justify-between gap-4 border-t border-hairline pt-2">
                <dt className="font-semibold">Points earned</dt>
                <dd className="tnum font-semibold text-gold-deep">+{points}</dd>
              </div>
            </dl>

            {error && <Notice tone="danger">{error}</Notice>}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={saving}>
                Back
              </Button>
              <Button variant="gold" onClick={() => void submit()} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />}
                {saving ? 'Crediting…' : `Confirm & credit ${points} points`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}