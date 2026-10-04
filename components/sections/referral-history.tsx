'use client'

// The referral history — every transaction the programme has ever recorded.
//
// This is the audit view. Where the main screen answers "who refers best?", this
// one answers "what happened, when, and who entered it?" — which is the question
// that comes up when a customer disputes a reward or a refund needs tracing.
//
// Reversed rows stay in the list, struck through rather than removed. A history
// that hides its reversals is not a history; it is a summary, and a summary
// cannot settle an argument.

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search, Undo2, X } from 'lucide-react'
import { Badge, Button, Field, Input, Notice, Select, money } from '@/components/ui'
import { useApi } from '@/lib/use-api'

type Row = {
  id: number
  referralCode: string
  referrerName: string | null
  referrerPhone: string | null
  referredCustomerName: string
  referredCustomerPhone: string | null
  invoiceNumber: string
  billAmount: string
  pointsEarned: number
  status: 'CREDITED' | 'REVERSED'
  purchaseDate: string | null
  notes: string | null
  createdBy: string
  reversedBy: string | null
  reversalReason: string | null
  createdAt: string
}

type Payload = { rows: Row[]; limit: number; offset: number; hasMore: boolean }

const PAGE_SIZE = 25

function day(value: string): string {
  try {
    return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return value
  }
}

export default function ReferralHistory({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [offset, setOffset] = useState(0)
  const [sort, setSort] = useState<'newest' | 'oldest' | 'highest' | 'lowest'>('newest')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reversing, setReversing] = useState<Row | null>(null)
  const [reason, setReason] = useState('')

  // Every filter change resets to the first page — staying on page 4 of a
  // narrower result set would show an empty table and look like a failure.
  useEffect(() => {
    setOffset(0)
  }, [query, status, from, to])

  const endpoint = useMemo(() => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
    if (query.trim()) params.set('q', query.trim())
    if (status) params.set('status', status)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    return `/api/referrals/history?${params.toString()}`
  }, [query, status, from, to, offset])

  const data = useApi<Payload>(endpoint)
  const rows = data.data?.rows ?? []

  // Sorting is done here rather than in SQL because a page is already small, and
  // sending a sort order to the server would re-order the whole table and make
  // "page 2" mean something different depending on the sort.
  const sorted = useMemo(() => {
    const copy = [...rows]
    switch (sort) {
      case 'oldest':
        return copy.reverse()
      case 'highest':
        return copy.sort((a, b) => Number(b.billAmount) - Number(a.billAmount))
      case 'lowest':
        return copy.sort((a, b) => Number(a.billAmount) - Number(b.billAmount))
      default:
        return copy
    }
  }, [rows, sort])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const reverse = async () => {
    if (!reversing) return
    setBusyId(reversing.id)
    setError('')
    try {
      const response = await fetch('/api/referrals/reverse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referralId: reversing.id, reason }),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) {
        setError(result.error ?? 'Could not reverse that referral.')
        setReversing(null)
        return
      }
      setMessage(`Referral on ${reversing.invoiceNumber} reversed. The points have been taken back.`)
      setReversing(null)
      setReason('')
      data.refresh()
    } catch {
      setError('Could not reach the server.')
      setReversing(null)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm sm:items-center">
      <div role="dialog" aria-modal="true" aria-label="Referral history" className="my-auto w-full max-w-6xl rounded-3xl border-hairline bg-card shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.16em] text-gold-deep uppercase">Audit trail</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">Referral history</h2>
            <p className="mt-1 text-xs text-muted-foreground">Every referral ever recorded, including those later reversed.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex size-8 shrink-0 items-center justify-center rounded-full transition hover:bg-secondary">
            <X className="size-4" />
          </button>
        </header>

        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
          {message && <Notice tone="success">{message}</Notice>}
          {error && <Notice tone="danger">{error}</Notice>}

          {/* --- Filters ---------------------------------------------------- */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Search">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Customer, code or invoice" className="pl-9" />
              </div>
            </Field>
            <Field label="Status">
              <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">All</option>
                <option value="CREDITED">Credited</option>
                <option value="REVERSED">Reversed</option>
              </Select>
            </Field>
            <Field label="From">
              <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </Field>
            <Field label="To">
              <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Field label="Sort">
              <Select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="w-44">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="highest">Highest bill</option>
                <option value="lowest">Lowest bill</option>
              </Select>
            </Field>
            {(query || status || from || to) && (
              <button
                onClick={() => {
                  setQuery('')
                  setStatus('')
                  setFrom('')
                  setTo('')
                }}
                className="mt-5 text-xs font-medium text-gold-deep hover:underline"
              >
                Clear filters
              </button>
            )}
            {data.isLoading && <Loader2 className="mt-5 size-4 animate-spin text-muted-foreground" />}
          </div>

          {/* --- The table -------------------------------------------------- */}
          {sorted.length === 0 && !data.isLoading ? (
            <p className="rounded-2xl border border-dashed border-hairline px-4 py-10 text-center text-sm text-muted-foreground">
              No referrals match these filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[72rem] text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                    <th className="px-3 py-2.5 font-semibold">Date</th>
                    <th className="px-3 py-2.5 font-semibold">Referral no.</th>
                    <th className="px-3 py-2.5 font-semibold">Referrer</th>
                    <th className="px-3 py-2.5 font-semibold">Referred customer</th>
                    <th className="px-3 py-2.5 font-semibold">Invoice</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Bill amount</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Points</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-3 py-2.5 font-semibold">Added by</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => {
                    const reversed = row.status === 'REVERSED'
                    return (
                      <tr key={row.id} className={`border-b border-hairline/60 ${reversed ? 'opacity-60' : ''}`}>
                        <td className="px-3 py-3 text-xs whitespace-nowrap">{day(row.createdAt)}</td>
                        <td className="px-3 py-3">
                          <span className="tnum text-xs font-semibold">{row.referralCode}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`font-medium ${reversed ? 'line-through' : ''}`}>{row.referrerName ?? '—'}</span>
                          <p className="tnum text-[11px] text-muted-foreground">{row.referrerPhone ?? ''}</p>
                        </td>
                        <td className="px-3 py-3">
                          {row.referredCustomerName}
                          {row.referredCustomerPhone && <p className="tnum text-[11px] text-muted-foreground">{row.referredCustomerPhone}</p>}
                        </td>
                        <td className="px-3 py-3">
                          <span className="tnum text-xs">{row.invoiceNumber}</span>
                          {row.reversalReason && <p className="text-[11px] text-muted-foreground">Reason: {row.reversalReason}</p>}
                        </td>
                        <td className="tnum px-3 py-3 text-right whitespace-nowrap">{money(Number(row.billAmount))}</td>
                        <td className={`tnum px-3 py-3 text-right font-semibold ${reversed ? 'text-muted-foreground line-through' : 'text-success'}`}>
                          +{row.pointsEarned}
                        </td>
                        <td className="px-3 py-3">
                          <Badge tone={reversed ? 'warn' : 'success'}>{reversed ? 'Reversed' : 'Credited'}</Badge>
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {row.createdBy}
                          {row.reversedBy && <p>Reversed by {row.reversedBy}</p>}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {!reversed && (
                            <Button
                              variant="outline"
                              className="h-9 px-3 text-xs"
                              disabled={busyId === row.id}
                              onClick={() => setReversing(row)}
                            >
                              {busyId === row.id ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}
                              Reverse
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* --- Paging ----------------------------------------------------- */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Showing {sorted.length === 0 ? 0 : offset + 1}–{offset + sorted.length}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="h-9 px-3 text-xs" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                Previous
              </Button>
              <Button
                variant="outline"
                className="h-9 px-3 text-xs"
                disabled={!data.data?.hasMore}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* --- Reversal confirmation ------------------------------------------ */}
      {reversing && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div role="alertdialog" aria-modal="true" aria-label="Reverse referral" className="w-full max-w-md rounded-3xl border-hairline bg-card p-6 shadow-2xl">
            <h3 className="text-lg font-semibold tracking-tight">Reverse this referral?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {reversing.pointsEarned} points will be taken back from {reversing.referrerName}. The original record stays in
              the history, marked as reversed.
            </p>

            <div className="mt-4">
              <Field label="Reason" hint="e.g. bill refunded, order cancelled">
                <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Bill refunded" autoFocus />
              </Field>
            </div>

            <p className="mt-3 rounded-2xl bg-secondary/70 px-4 py-3 text-xs leading-5 text-muted-foreground">
              If the customer has already spent these points, the reversal will be refused and the account flagged for
              review instead — the system will never create a negative balance.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setReversing(null)} disabled={busyId !== null}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void reverse()} disabled={busyId !== null || reason.trim() === ''}>
                {busyId !== null ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
                Reverse referral
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}