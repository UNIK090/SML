'use client'

// Referral & Rewards settings.
//
// The rule lives here rather than in code so the shop can change its festival
// rate without a deploy. Two things about that are worth stating plainly on the
// screen itself, because a shopkeeper changing a number deserves to know what it
// does and does not affect:
//
//   · a change applies to FUTURE referrals only
//   · every past referral keeps the points it was actually awarded
//
// The second point is not a technicality. Those points were a promise made to a
// customer, and restating them when the rate moves would make every statement the
// shop has already given wrong.

import { useEffect, useState } from 'react'
import { Check, Loader2, Save, Settings2, X } from 'lucide-react'
import { Button, Field, Input, Notice, Select, money } from '@/components/ui'
import { useApi } from '@/lib/use-api'

type Settings = {
  referralEnabled: boolean
  referralAmountStep: number
  pointsPerStep: number
  redemptionValuePerPoint: number
  minimumPointsToRedeem: number
  maximumPointsPerBill: number
  allowManualAdjustment: boolean
}

export default function RewardSettings({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const data = useApi<Settings>('/api/referrals/settings')
  const [form, setForm] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Adopt the loaded values once, then let the user edit freely. Re-syncing on
  // every fetch would wipe what they are typing.
  useEffect(() => {
    if (data.data && !form) setForm(data.data)
  }, [data.data, form])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async () => {
    if (!form) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/referrals/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const result = (await response.json()) as Settings & { error?: string }
      if (!response.ok) {
        setError(result.error ?? 'Could not save the settings.')
        return
      }
      setForm(result)
      setMessage('Saved. The new rule applies to future referrals only.')
      onSaved()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  // A live example, so the effect of the two numbers is obvious before saving.
  const example = form ? Math.floor(2500 / (form.referralAmountStep || 1)) * form.pointsPerStep : 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm sm:items-center">
      <div role="dialog" aria-modal="true" aria-label="Reward settings" className="my-auto w-full max-w-xl rounded-3xl border-hairline bg-card shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.16em] text-gold-deep uppercase">Settings</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">Referral &amp; Rewards</h2>
            <p className="mt-1 text-xs text-muted-foreground">Changes apply to future referrals. Past transactions keep the points they earned.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex size-8 shrink-0 items-center justify-center rounded-full transition hover:bg-secondary">
            <X className="size-4" />
          </button>
        </header>

        {!form ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
            {message && <Notice tone="success">{message}</Notice>}
            {error && <Notice tone="danger">{error}</Notice>}

            {/* The master switch, given its own weight — it is the one setting
                that changes what customers can do, not just how much they get. */}
            <button
              type="button"
              onClick={() => setForm({ ...form, referralEnabled: !form.referralEnabled })}
              aria-pressed={form.referralEnabled}
              className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${form.referralEnabled ? 'border-gold bg-gold-soft/70' : 'border-hairline bg-secondary/60'
                }`}
            >
              <span>
                <span className="block text-sm font-semibold">{form.referralEnabled ? 'Referral programme is ON' : 'Referral programme is OFF'}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {form.referralEnabled
                    ? 'Customers earn points on referred purchases.'
                    : 'New referrals are refused. Existing balances can still be redeemed.'}
                </span>
              </span>
              <span className={`flex size-6 shrink-0 items-center justify-center rounded-full border ${form.referralEnabled ? 'border-gold bg-gold text-slate-950' : 'border-hairline'}`}>
                {form.referralEnabled && <Check className="size-3.5" />}
              </span>
            </button>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Purchase step (₹)" hint="Whole blocks only — ₹999 counts as one ₹500 block">
                <Input
                  type="number"
                  min="1"
                  value={form.referralAmountStep}
                  onChange={(event) => setForm({ ...form, referralAmountStep: Number(event.target.value) })}
                />
              </Field>
              <Field label="Points per step">
                <Input
                  type="number"
                  min="1"
                  value={form.pointsPerStep}
                  onChange={(event) => setForm({ ...form, pointsPerStep: Number(event.target.value) })}
                />
              </Field>
              <Field label="Value of 1 point (₹)" hint="What a point is worth when redeemed">
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.redemptionValuePerPoint}
                  onChange={(event) => setForm({ ...form, redemptionValuePerPoint: Number(event.target.value) })}
                />
              </Field>
              <Field label="Minimum points to redeem" hint="0 means no minimum">
                <Input
                  type="number"
                  min="0"
                  value={form.minimumPointsToRedeem}
                  onChange={(event) => setForm({ ...form, minimumPointsToRedeem: Number(event.target.value) })}
                />
              </Field>
              <Field label="Maximum points per bill" hint="0 means no cap">
                <Input
                  type="number"
                  min="0"
                  value={form.maximumPointsPerBill}
                  onChange={(event) => setForm({ ...form, maximumPointsPerBill: Number(event.target.value) })}
                />
              </Field>
            </div>

            <button
              type="button"
              onClick={() => setForm({ ...form, allowManualAdjustment: !form.allowManualAdjustment })}
              aria-pressed={form.allowManualAdjustment}
              className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${form.allowManualAdjustment ? 'border-gold bg-gold-soft/70' : 'border-hairline bg-secondary/60'
                }`}
            >
              <span>
                <span className="block text-sm font-medium">Allow manual point adjustments</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Reversals stay available either way — they are part of the audit trail.
                </span>
              </span>
              <span className={`flex size-6 shrink-0 items-center justify-center rounded-full border ${form.allowManualAdjustment ? 'border-gold bg-gold text-slate-950' : 'border-hairline'}`}>
                {form.allowManualAdjustment && <Check className="size-3.5" />}
              </span>
            </button>

            {/* A worked example, because "₹500 → 30 points" is abstract and
                "a ₹2,500 bill earns 150 points" is not. */}
            <div className="rounded-2xl border border-dashed border-gold bg-gold-soft/50 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-gold-deep uppercase">
                <Settings2 className="size-3.5" /> With this rule
              </p>
              <p className="mt-1 text-sm text-gold-deep">
                A {money(2500)} bill earns <strong className="tnum">{example}</strong> points, worth{' '}
                <strong className="tnum">{money(example * form.redemptionValuePerPoint)}</strong> off a future purchase.
              </p>
            </div>
          </div>
        )}

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline px-5 py-4 sm:px-6">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="gold" onClick={() => void save()} disabled={busy || !form}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save settings
          </Button>
        </footer>
      </div>
    </div>
  )
}