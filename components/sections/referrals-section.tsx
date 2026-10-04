'use client'

// The Referral Program screen.
//
// A referral scheme is a promise the shop makes to a customer: "bring someone in
// and we will reward you". This screen is where that promise is kept — it is
// where staff look up a code, record the purchase that earned points, and see who
// is owed what.
//
// It is deliberately built around the counter, not around the database. A
// customer is standing there with a bill; the staff member has a referral number
// written on a card. So the primary action is one button, the lookup is one
// field, and the points are shown before anything is committed.

import { useCallback, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  Award,
  BadgeIndianRupee,
  Coins,
  Gift,
  Gift as GiftIcon,
  HandCoins,
  Loader2,
  Plus,
  Search,
  ShieldAlert,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Badge, Button, Card, EmptyState, Input, Notice, SectionHeading, StatCard, WorkspaceHero, money } from '@/components/ui'
import { useApi } from '@/lib/use-api'

const AddReferralModal = dynamic(() => import('@/components/sections/referral-add-modal'), { ssr: false })
const ReferralHistory = dynamic(() => import('@/components/sections/referral-history'), { ssr: false })
const CustomerRewardsPanel = dynamic(() => import('@/components/sections/customer-rewards-panel'), { ssr: false })
const RewardSettings = dynamic(() => import('@/components/sections/reward-settings'), { ssr: false })

/** One row of the referral table, as /api/referrals returns it. */
type ReferralRow = {
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
  successfulReferrals: number
  referralSales: number
  lastReferralAt: string | null
}

type Summary = {
  totalReferralCustomers: number
  successfulReferrals: number
  pointsIssued: number
  pointsRedeemed: number
  pointsOutstanding: number
  referralSales: number
}

type Payload = {
  settings: { referralEnabled: boolean; referralAmountStep: number; pointsPerStep: number; redemptionValuePerPoint: number }
  summary: Summary
  customers: ReferralRow[]
}

/** "04 Oct 2026" — the date format the rest of the workspace uses. */
function shortDate(value: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return '—'
  }
}

export default function ReferralsSection() {
  const [query, setQuery] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [openCustomer, setOpenCustomer] = useState<ReferralRow | null>(null)
  const [message, setMessage] = useState('')

  // The search term is sent to the server rather than filtered here: the table
  // shows a page of rows, so filtering in the browser would only ever search the
  // rows already loaded and quietly miss the customer the staff member is after.
  const endpoint = useMemo(
    () => (query.trim() ? `/api/referrals?q=${encodeURIComponent(query.trim())}` : '/api/referrals'),
    [query],
  )
  const data = useApi<Payload>(endpoint, { refreshInterval: 60_000 })
  const rows = data.data?.customers ?? []
  const summary = data.data?.summary
  const settings = data.data?.settings

  const refresh = useCallback(() => data.refresh(), [data])

  const onCredited = useCallback(
    (text: string) => {
      setAddOpen(false)
      setMessage(text)
      refresh()
    },
    [refresh],
  )

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHero
        eyebrow="Customer rewards"
        title="Referral Program"
        description="Every customer has a referral number they can share. When the person they referred buys at the counter, enter the bill here and the points are credited automatically."
        action={
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border-white/15 bg-white/10 px-3 py-2 text-xs font-medium text-slate-100 backdrop-blur transition hover:bg-white/20"
          >
            <Plus className="size-3.5" /> Add Referral Purchase
          </button>
        }
      />

      {/* The rule currently in force, stated plainly. A shopkeeper quoting a
          scheme to a customer over the phone needs this visible, not buried in
          a settings screen. */}
      {settings && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border-hairline bg-secondary/60 px-4 py-3 text-xs">
          <span className="flex items-center gap-1.5 font-medium">
            <Gift className="size-3.5 text-gold-deep" />
            {settings.referralEnabled ? 'Programme is running' : 'Programme is switched off'}
          </span>
          <span className="text-muted-foreground">
            {money(settings.referralAmountStep)} spent = {settings.pointsPerStep} points
          </span>
          <span className="text-muted-foreground">1 point = {money(settings.redemptionValuePerPoint)} off</span>
          <button onClick={() => setSettingsOpen(true)} className="ml-auto font-medium text-gold-deep hover:underline">
            Change rule
          </button>
        </div>
      )}

      {message && <Notice tone="success">{message}</Notice>}

      {/* Six cards, in the order a shopkeeper thinks: who is in the programme,
          what it has brought in, what is owed. */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard icon={Users} label="Referral customers" value={String(summary?.totalReferralCustomers ?? 0)} hint="Customers with a referral number" loading={data.isLoading} />
        <StatCard icon={Award} label="Successful referrals" value={String(summary?.successfulReferrals ?? 0)} hint="Referred purchases that counted" tone="success" loading={data.isLoading} />
        <StatCard icon={BadgeIndianRupee} label="Referral sales" value={money(summary?.referralSales ?? 0)} hint="Value brought in by referrals" tone="gold" loading={data.isLoading} />
        <StatCard icon={TrendingUp} label="Points issued" value={String(summary?.pointsIssued ?? 0)} hint="Earned by customers so far" loading={data.isLoading} />
        <StatCard icon={HandCoins} label="Points redeemed" value={String(summary?.pointsRedeemed ?? 0)} hint="Already spent on purchases" loading={data.isLoading} />
        <StatCard icon={Coins} label="Outstanding points" value={String(summary?.pointsOutstanding ?? 0)} hint="Still owed to customers" tone="warn" loading={data.isLoading} />
      </section>

      <Card>
        <SectionHeading
          title="Customers and their referral numbers"
          description="Search by name, mobile number or referral number."
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setHistoryOpen(true)}>
                <GiftIcon className="size-4" /> Referral history
              </Button>
              <Button variant="gold" onClick={() => setAddOpen(true)}>
                <Plus className="size-4" /> Add Referral Purchase
              </Button>
            </div>
          }
        />

        <div className="mb-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, mobile or SML number…"
              className="pl-9"
              aria-label="Search customers"
            />
          </div>
          {data.isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>

        {data.error ? (
          <Notice tone="danger">{data.error}</Notice>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={GiftIcon}
            title={query ? 'No customer matches that search' : 'No customers yet'}
            description={
              query
                ? 'Try a different name, mobile number or referral number.'
                : 'A referral number is issued automatically the first time a customer is billed with a mobile number.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                  <th className="px-3 py-2.5 font-semibold">Customer</th>
                  <th className="px-3 py-2.5 font-semibold">Referral no.</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Referrals</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Referral sales</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Available</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Earned</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Redeemed</th>
                  <th className="px-3 py-2.5 font-semibold">Last referral</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-hairline/60 transition hover:bg-secondary/40">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{row.name}</span>
                        {row.flaggedForReview && (
                          <span title="Flagged for review" className="text-destructive">
                            <ShieldAlert className="size-3.5" />
                          </span>
                        )}
                        {!row.active && <Badge tone="neutral">Inactive</Badge>}
                      </div>
                      <p className="tnum text-[11px] text-muted-foreground">{row.phoneDisplay ?? row.phone}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className="tnum rounded-lg bg-gold-soft px-2 py-1 text-xs font-semibold text-gold-deep">{row.referralCode}</span>
                    </td>
                    <td className="tnum px-3 py-3 text-right">{row.successfulReferrals}</td>
                    <td className="tnum px-3 py-3 text-right">{money(row.referralSales)}</td>
                    <td className="tnum px-3 py-3 text-right font-semibold text-gold-deep">{row.rewardPoints}</td>
                    <td className="tnum px-3 py-3 text-right text-muted-foreground">{row.totalReferralPointsEarned}</td>
                    <td className="tnum px-3 py-3 text-right text-muted-foreground">{row.totalPointsRedeemed}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{shortDate(row.lastReferralAt)}</td>
                    <td className="px-3 py-3 text-right">
                      <Button variant="outline" className="h-9 px-3 text-xs" onClick={() => setOpenCustomer(row)}>
                        Rewards
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {addOpen && (
        <AddReferralModal
          onClose={() => setAddOpen(false)}
          onCredited={onCredited}
        />
      )}

      {historyOpen && <ReferralHistory onClose={() => setHistoryOpen(false)} />}

      {settingsOpen && <RewardSettings onClose={() => setSettingsOpen(false)} onSaved={refresh} />}

      {openCustomer && (
        <CustomerRewardsPanel
          customerId={openCustomer.id}
          onClose={() => setOpenCustomer(null)}
          onChanged={refresh}
        />
      )}
    </div>
  )
}