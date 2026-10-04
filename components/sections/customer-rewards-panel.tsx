'use client'

// One customer's Rewards & Referrals panel.
//
// This is the screen a shopkeeper opens when a customer says "I think I am owed
// some points". It answers with the numbers first and then with the list of
// events that produced them, because the list is what settles the conversation —
// a balance on its own is an assertion, and a history is evidence.
//
// Three actions live here, and all three are deliberately behind a confirmation:
// redeeming spends the customer's money, adjusting moves it by hand, and both are
// hard to unpick once a customer has been told about them.

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Coins, Loader2, MinusCircle, PlusCircle, ShieldAlert, Sparkles, X } from 'lucide-react'
import { Badge, Button, Field, Input, Notice, money } from '@/components/ui'
import { useApi } from '@/lib/use-api'

type Customer = {
  id: number
  name: string
  phone: string
  phoneDisplay: string | null
  referralCode: string
  rewardPoints: number
  totalReferralPointsEarned: number
  totalPointsRedeemed: number
  flaggedForReview: boolean
  active: boolean
}

type LedgerRow = {
  id: number
  type: 'REFERRAL_EARNED' | 'REDEEMED' | 'ADJUSTMENT' | 'REVERSAL'
  points: number
  balanceAfter: number
  description: string
  createdBy: string
  createdAt: string
}

type Payload = {
  customer: Customer
  stats: { successfulReferrals: number; referralValue: number }
  history: LedgerRow[]
}

/** The badge colour and wording for each kind of ledger movement. */
const LEDGER_TONE: Record<LedgerRow['type'], { label: string; tone: 'success' | 'gold' | 'neutral' | 'warn' }> = {
  REFERRAL_EARNED: { label: 'Referral earned', tone: 'success' },
  REDEEMED: { label: 'Redeemed', tone: 'gold' },
  ADJUSTMENT: { label: 'Adjustment', tone: 'neutral' },
  // `warn` rather than an error tone: a reversal is a legitimate correction, not
  // a failure, and colouring it red would make routine refunds look alarming.
  REVERSAL: { label: 'Reversal', tone: 'warn' },
}

function when(value: string): string {
  try {
    return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return value
  }
}

export default function CustomerRewardsPanel({
  customerId,
  onClose,
  onChanged,
}: {
  customerId: number
  onClose: () => void
  /** Lets the table behind refresh after a balance moves. */
  onChanged: () => void
}) {
  const data = useApi<Payload>(`/api/referrals/customer?id=${customerId}`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [dialog, setDialog] = useState<null | 'redeem' | 'adjust'>(null)
  const [points, setPoints] = useState('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const customer = data.data?.customer
  const stats = data.data?.stats
  const history = data.data?.history ?? []

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true)
      setError('')
      setMessage('')
      try {
        const response = await fetch('/api/referrals/customer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerId, ...body }),
        })
        const result = (await response.json()) as { error?: string; message?: string }
        if (!response.ok) {
          setError(result.error ?? 'Could not complete that.')
          return false
        }
        setMessage(result.message ?? 'Done.')
        setDialog(null)
        setPoints('')
        setReason('')
        data.refresh()
        onChanged()
        return true
      } catch {
        setError('Could not reach the server.')
        return false
      } finally {
        setBusy(false)
      }
    },
    [customerId, data, onChanged],
  )

  const requested = Math.trunc(Number(points)) || 0
  const redeemValue = requested // 1 point = ₹1 under the current rule.

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm sm:items-center">
      <div role="dialog" aria-modal="true" aria-label="Customer rewards" className="my-auto w-full max-w-3xl rounded-3xl border-hairline bg-card shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-gold-deep uppercase">Rewards &amp; referrals</p>
            <h2 className="mt-1 truncate text-lg font-semibold tracking-tight">{customer?.name ?? 'Loading…'}</h2>
            <p className="tnum mt-0.5 text-xs text-muted-foreground">
              {customer ? (customer.phoneDisplay ?? customer.phone) : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex size-8 shrink-0 items-center justify-center rounded-full transition hover:bg-secondary">
            <X className="size-4" />
          </button>
        </header>

        {data.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : data.error ? (
          <div className="px-5 py-5 sm:px-6">
            <Notice tone="danger">{data.error}</Notice>
          </div>
        ) : customer ? (
          <div className="flex flex-col gap-5 px-5 py-5 sm:px-6">
            {customer.flaggedForReview && (
              <Notice tone="danger">
                <span className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    This account is flagged for review — a reversed referral could not be taken back because the points had
                    already been spent. Check the history below and settle it with a manual adjustment.
                  </span>
                </span>
              </Notice>
            )}
            {!customer.active && <Notice tone="danger">This account is inactive, so it cannot earn or redeem points.</Notice>}
            {message && <Notice tone="success">{message}</Notice>}

            {/* --- The numbers ---------------------------------------------- */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-gold bg-gold-soft/70 px-4 py-3">
                <p className="text-[10px] font-semibold tracking-wide text-gold-deep uppercase">Available points</p>
                <p className="tnum mt-1 text-2xl font-semibold text-gold-deep">{customer.rewardPoints}</p>
              </div>
              <div className="rounded-2xl border-hairline bg-secondary/60 px-4 py-3">
                <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Lifetime earned</p>
                <p className="tnum mt-1 text-2xl font-semibold">{customer.totalReferralPointsEarned}</p>
              </div>
              <div className="rounded-2xl border-hairline bg-secondary/60 px-4 py-3">
                <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Redeemed</p>
                <p className="tnum mt-1 text-2xl font-semibold">{customer.totalPointsRedeemed}</p>
              </div>
              <div className="rounded-2xl border-hairline bg-secondary/60 px-4 py-3">
                <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Referral number</p>
                <p className="tnum mt-1 text-lg font-semibold">{customer.referralCode}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border-hairline bg-secondary/40 px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Successful referrals <strong className="tnum text-foreground">{stats?.successfulReferrals ?? 0}</strong>
              </span>
              <span className="text-muted-foreground">
                Referral sales <strong className="tnum text-foreground">{money(stats?.referralValue ?? 0)}</strong>
              </span>
            </div>

            {/* --- The actions --------------------------------------------- */}
            <div className="flex flex-wrap gap-2">
              <Button variant="gold" onClick={() => setDialog('redeem')} disabled={customer.rewardPoints <= 0}>
                <Coins className="size-4" /> Redeem points
              </Button>
              <Button variant="outline" onClick={() => setDialog('adjust')}>
                <Sparkles className="size-4" /> Adjust points
              </Button>
              <Button
                variant="ghost"
                onClick={() => void act({ action: 'set-active', active: !customer.active })}
                disabled={busy}
              >
                {customer.active ? 'Deactivate account' : 'Reactivate account'}
              </Button>
              {customer.flaggedForReview && (
                <Button variant="ghost" onClick={() => void act({ action: 'clear-flag' })} disabled={busy}>
                  Clear review flag
                </Button>
              )}
            </div>

            {/* --- The history --------------------------------------------- */}
            <div>
              <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Points history</p>
              {history.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-hairline px-4 py-6 text-center text-sm text-muted-foreground">
                  No points movements yet. The first referral credit will appear here.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-hairline/60 rounded-2xl border-hairline bg-card/60">
                  {history.map((entry) => {
                    const meta = LEDGER_TONE[entry.type]
                    return (
                      <li key={entry.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                            <span className="truncate text-sm">{entry.description}</span>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {when(entry.createdAt)} · by {entry.createdBy} · balance after {entry.balanceAfter}
                          </p>
                        </div>
                        <span className={`tnum shrink-0 text-sm font-semibold ${entry.points > 0 ? 'text-success' : 'text-destructive'}`}>
                          {entry.points > 0 ? '+' : ''}
                          {entry.points}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* --- Redeem ------------------------------------------------------- */}
      {dialog === 'redeem' && customer && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div role="alertdialog" aria-modal="true" aria-label="Redeem points" className="w-full max-w-md rounded-3xl border-hairline bg-card p-6 shadow-2xl">
            <h3 className="text-lg font-semibold tracking-tight">Redeem reward points</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {customer.name} has <strong className="tnum">{customer.rewardPoints}</strong> points available. One point is worth ₹1 off a bill.
            </p>

            <div className="mt-4">
              <Field label="Points to redeem">
                <Input
                  type="number"
                  min="1"
                  max={customer.rewardPoints}
                  value={points}
                  onChange={(event) => setPoints(event.target.value)}
                  placeholder="200"
                  autoFocus
                />
              </Field>
            </div>

            {requested > 0 && (
              <div className="mt-3 rounded-2xl bg-secondary/70 px-4 py-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reward discount</span>
                  <span className="tnum font-semibold text-gold-deep">{money(redeemValue)}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-muted-foreground">Remaining balance</span>
                  <span className="tnum font-semibold">{Math.max(0, customer.rewardPoints - requested)} points</span>
                </div>
              </div>
            )}

            {requested > customer.rewardPoints && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="size-3.5" /> That is more than the available balance.
              </p>
            )}
            {error && <Notice tone="danger">{error}</Notice>}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDialog(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="gold"
                disabled={busy || requested <= 0 || requested > customer.rewardPoints}
                onClick={() => void act({ action: 'redeem', points: requested })}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Coins className="size-4" />}
                Redeem {requested > 0 ? `${requested} points` : ''}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* --- Adjust ------------------------------------------------------- */}
      {dialog === 'adjust' && customer && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div role="alertdialog" aria-modal="true" aria-label="Adjust points" className="w-full max-w-md rounded-3xl border-hairline bg-card p-6 shadow-2xl">
            <h3 className="text-lg font-semibold tracking-tight">Adjust points</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Use a negative number to take points away. A reason is required, and your name is recorded against the change.
            </p>

            <div className="mt-4 flex flex-col gap-4">
              <Field label="Points" hint="Positive to add, negative to remove">
                <Input
                  type="number"
                  value={points}
                  onChange={(event) => setPoints(event.target.value)}
                  placeholder="e.g. 50 or -50"
                  autoFocus
                />
              </Field>
              <Field label="Reason" hint="Recorded permanently in the customer's history">
                <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Goodwill for a delayed order" />
              </Field>
            </div>

            {error && <Notice tone="danger">{error}</Notice>}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDialog(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="gold"
                disabled={busy || requested === 0 || reason.trim() === ''}
                onClick={() => void act({ action: 'adjust', points: requested, reason })}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : requested >= 0 ? <PlusCircle className="size-4" /> : <MinusCircle className="size-4" />}
                Apply adjustment
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}