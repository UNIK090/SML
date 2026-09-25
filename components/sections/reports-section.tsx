'use client'

// ===========================================================================
// The Reports screen.
//
// A shopkeeper opens this screen to answer three questions, in this order:
//
//   1. How much did I take this month, and is that better or worse than before?
//   2. When do I actually sell — which days are worth staffing and stocking for?
//   3. What sold, and has it been paid for?
//
// The screen is laid out in exactly that order. The daily bar chart still shows
// zero days, so the midnight reset is visible and the month total stays
// auditable against the ledger — that behaviour is deliberate and unchanged.
// ===========================================================================

import { useMemo, useState } from 'react'
import {
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  CreditCard,
  Layers,
  ReceiptText,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import {
  Card,
  EmptyState,
  Field,
  Input,
  SectionHeading,
  Skeleton,
  StatCard,
  Table,
  WorkspaceHero,
  formatDay,
  money,
} from '@/components/ui'
import { ActivityStrip, DonutChart, TrendPill, WeekdayChart } from '@/components/sections/report-charts'
import { useApi } from '@/lib/use-api'
import { businessMonth } from '@/lib/business-time'
import type { Dashboard, MonthlyReport } from '@/lib/types'

const monthLabel = (value: string) => {
  const [year, month] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  )
}

/** Shifts a `YYYY-MM` month by a number of months, for the prev/next controls. */
const shiftMonth = (month: string, delta: number) => {
  const [year, m] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, m - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export default function ReportsSection({ dashboard, dashboardLoading }: { dashboard: Dashboard | null; dashboardLoading: boolean }) {
  const [month, setMonth] = useState(() => businessMonth())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const report = useApi<MonthlyReport>(`/api/reports?month=${encodeURIComponent(month)}`, { refreshInterval: 30_000 })
  const data = report.data

  const today = useMemo(
    () => data?.days.find((day) => day.businessDay === data.currentBusinessDay) ?? { businessDay: '', total: 0, count: 0 },
    [data],
  )
  const maxTotal = useMemo(() => Math.max(...(data?.days.map((day) => day.total) ?? [0]), 1), [data])

  // The next month is in the future, so the control is capped at the current
  // one — arrowing into empty months is never useful.
  const currentMonth = businessMonth()
  const canGoForward = month < currentMonth

  // Selecting a day brings its ledger row to the top, so tapping a quiet square
  // in the strip and finding that day's invoice is one motion.
  const ledgerDays = useMemo(() => {
    const rows = data?.days.slice().reverse() ?? []
    if (!selectedDay) return rows
    return rows.sort((a, b) => (a.businessDay === selectedDay ? -1 : b.businessDay === selectedDay ? 1 : 0))
  }, [data?.days, selectedDay])

  const collected = useMemo(
    () => data?.payments.filter((p) => p.label === 'PAID').reduce((sum, p) => sum + p.total, 0) ?? 0,
    [data?.payments],
  )

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHero
        eyebrow="Business intelligence"
        title="Income reports"
        description="See how the month is trading, which days earn most, and what actually sold — all from your saved invoices."
        action={
          <span className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-medium text-slate-100 backdrop-blur">
            India time · resets at 12:00 AM
          </span>
        }
      />

      {/* ------------------------------ Month picker ------------------------------ */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-hairline bg-card/95 px-4 py-3 shadow-[var(--shadow-sm)]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMonth((value) => shiftMonth(value, -1))}
            aria-label="Previous month"
            className="flex size-9 items-center justify-center rounded-lg border-hairline bg-card transition hover:border-gold"
          >
            <span aria-hidden>←</span>
          </button>
          <div className="min-w-[9.5rem] text-center">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Report month</p>
            <p className="text-sm font-semibold">{data ? monthLabel(data.month) : monthLabel(month)}</p>
          </div>
          <button
            type="button"
            onClick={() => setMonth((value) => shiftMonth(value, 1))}
            disabled={!canGoForward}
            aria-label="Next month"
            className="flex size-9 items-center justify-center rounded-lg border-hairline bg-card transition hover:border-gold disabled:opacity-35"
          >
            <span aria-hidden>→</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data && <TrendPill changePct={data.yearChangePct} previousTotal={data.previousYearTotal} />}
          <div className="w-40">
            <Field label="Jump to month">
              <Input
                type="month"
                value={month}
                max={currentMonth}
                onChange={(event) => event.target.value && setMonth(event.target.value)}
              />
            </Field>
          </div>
        </div>
      </div>

      {/* ------------------------------- Headline stats ------------------------------- */}
      <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <StatCard
          icon={CircleDollarSign}
          label="Monthly income"
          amount={data?.total ?? 0}
          hint={`${data?.count ?? 0} invoice${data?.count === 1 ? '' : 's'} recorded`}
          tone="gold"
          loading={report.isLoading}
        />
        <StatCard
          icon={ReceiptText}
          label="Income today"
          amount={today.total}
          hint={today.count ? `${today.count} invoice${today.count === 1 ? '' : 's'} today` : 'Fresh daily balance'}
          tone="success"
          loading={report.isLoading}
        />
        <StatCard
          icon={TrendingUp}
          label="All-time income"
          amount={dashboard?.allTotal ?? 0}
          hint={`${dashboard?.allCount ?? 0} invoice${dashboard?.allCount === 1 ? '' : 's'} retained`}
          loading={dashboardLoading}
        />
        <StatCard
          icon={Trophy}
          label="Best day"
          amount={data?.bestDay.total ?? 0}
          hint={data?.bestDay.businessDay ? formatDay(data.bestDay.businessDay) : 'No sales yet'}
          tone="warn"
          loading={report.isLoading}
        />
      </section>

      {report.error ? (
        <Card>
          <EmptyState icon={BarChart3} title="Could not load this report" description={report.error} />
        </Card>
      ) : report.isLoading ? (
        <Card>
          <Skeleton className="mb-4 h-5 w-52" />
          <div className="grid h-60 grid-cols-12 items-end gap-2 px-3">
            {Array.from({ length: 12 }).map((_, index) => (
              <Skeleton key={index} className={`w-full ${index % 3 === 0 ? 'h-48' : index % 2 === 0 ? 'h-32' : 'h-20'}`} />
            ))}
          </div>
        </Card>
      ) : data ? (
        <>
          {/* ---------------------------- Month at a glance ---------------------------- */}
          <Card className="business-primary-card">
            <SectionHeading
              title="Month at a glance"
              description="One square per day, shaded by how much you sold. Quiet days stay visible so the pattern is honest."
            />
            <ActivityStrip
              days={data.days}
              currentBusinessDay={data.currentBusinessDay}
              selected={selectedDay}
              onSelect={(day) => setSelectedDay((current) => (current === day ? null : day))}
            />

            <dl className="mt-5 grid gap-3 border-t border-hairline pt-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Trading days', value: `${data.activeDays} of ${data.days.length}`, hint: 'Days with at least one invoice' },
                { label: 'Average trading day', value: money(data.averageActiveDay), hint: 'Excludes days with no sales' },
                { label: 'Average invoice', value: money(data.averageInvoice), hint: `Across ${data.count} invoice${data.count === 1 ? '' : 's'}` },
                { label: 'Highest invoice', value: money(data.highestInvoice), hint: 'Largest single sale this month' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border-hairline bg-secondary/40 px-3.5 py-3">
                  <dt className="text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{stat.label}</dt>
                  <dd className="tnum mt-1 text-lg font-semibold">{stat.value}</dd>
                  <dd className="mt-0.5 text-[11px] text-muted-foreground">{stat.hint}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* ---------------------------- Daily income bars ---------------------------- */}
          <Card>
            <SectionHeading
              title="Daily income over month"
              description="Every calendar day is shown. A zero bar means there were no invoices on that business day."
            />

            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-hairline bg-secondary/45 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                <CalendarDays className="size-4 text-gold-deep" /> {monthLabel(data.month)}
              </p>
              <p className="text-xs text-muted-foreground">
                {data.activeDays} of {data.days.length} days with sales · Average trading day {money(data.averageActiveDay)}
              </p>
            </div>

            <div className="overflow-x-auto pb-2">
              <div className="min-w-[660px]">
                <div className="flex h-60 items-end gap-1.5 border-b border-hairline px-1">
                  {data.days.map((day) => {
                    const percent = day.total > 0 ? Math.max((day.total / maxTotal) * 100, 4) : 2
                    const isToday = day.businessDay === data.currentBusinessDay
                    const dimmed = selectedDay !== null && selectedDay !== day.businessDay
                    return (
                      <div
                        key={day.businessDay}
                        className="group relative flex h-full min-w-0 flex-1 items-end"
                        title={`${formatDay(day.businessDay)} · ${money(day.total)} · ${day.count} invoice${day.count === 1 ? '' : 's'}`}
                      >
                        <div
                          className={`w-full rounded-t-md transition duration-200 group-hover:brightness-110 ${
                            isToday ? 'bg-gold shadow-[0_0_0_2px_var(--gold-soft)]' : day.total > 0 ? 'bg-primary/82' : 'bg-secondary'
                          }`}
                          style={{ height: `${percent}%`, opacity: dimmed ? 0.3 : 1 }}
                        />
                        <span className="pointer-events-none absolute right-1/2 bottom-2 z-10 hidden w-max translate-x-1/2 -translate-y-full rounded-lg bg-slate-950 px-2 py-1 text-[10px] text-white shadow-lg group-hover:block">
                          {formatDay(day.businessDay)} · {money(day.total)}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-2 flex gap-1.5 px-1 text-[10px] text-muted-foreground">
                  {data.days.map((day, index) => (
                    <span key={day.businessDay} className="min-w-0 flex-1 text-center">
                      {index === 0 || index === data.days.length - 1 || (index + 1) % 5 === 0 ? index + 1 : ''}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* ---------------------------- Pattern and breakdown ---------------------------- */}
          <section className="grid gap-5 lg:grid-cols-2">
            <Card>
              <SectionHeading
                title="Which days earn most"
                description="Average income for each weekday, averaged over the days you actually traded."
              />
              <WeekdayChart weekdays={data.weekdays} />
            </Card>

            <Card>
              <SectionHeading
                title="What sold this month"
                description="Income by category of the pieces billed, largest first."
              />
              {data.categories.length === 0 ? (
                <EmptyState
                  icon={Layers}
                  title="Nothing sold yet"
                  description="Categories appear here once invoices are saved this month."
                />
              ) : (
                <DonutChart slices={data.categories} title="Income by category" centerLabel="Total" centerValue={money(data.total)} />
              )}
            </Card>
          </section>

          {/* ---------------------------- Payment status ---------------------------- */}
          {data.payments.length > 0 && (
            <Card>
              <SectionHeading
                title="Payment status"
                description="How much of this month’s billing has actually been collected."
                action={
                  <span className="rounded-xl border border-gold/40 bg-gold-soft/45 px-3 py-1.5 text-xs font-medium text-gold-deep">
                    <CreditCard className="mr-1.5 inline size-3.5" />
                    {money(collected)} collected
                  </span>
                }
              />

              {/* A single stacked bar is the clearest way to show a two-way split. */}
              <div className="mb-4 flex h-3.5 overflow-hidden rounded-full bg-secondary">
                {data.payments.map((slice) => (
                  <div
                    key={slice.label}
                    style={{
                      width: `${slice.share}%`,
                      background: slice.label === 'PAID' ? 'var(--success)' : 'var(--warn)',
                    }}
                    title={`${slice.label} · ${slice.share.toFixed(1)}% · ${money(slice.total)}`}
                  />
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {data.payments.map((slice) => (
                  <div key={slice.label} className="flex items-center justify-between gap-3 rounded-xl border-hairline bg-secondary/40 px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: slice.label === 'PAID' ? 'var(--success)' : 'var(--warn)' }}
                        aria-hidden
                      />
                      <span className="text-sm font-medium">{slice.label === 'PAID' ? 'Paid' : 'Payment pending'}</span>
                    </div>
                    <div className="text-right">
                      <p className="tnum text-sm font-semibold">{money(slice.total)}</p>
                      <p className="tnum text-[11px] text-muted-foreground">
                        {slice.count} invoice{slice.count === 1 ? '' : 's'} · {slice.share.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ---------------------------- Ledger ---------------------------- */}
          <Card>
            <SectionHeading
              title="Daily report ledger"
              description="A monthly, day-by-day audit trail generated from saved invoices."
              action={
                selectedDay ? (
                  <button
                    type="button"
                    onClick={() => setSelectedDay(null)}
                    className="rounded-lg border-hairline bg-card px-3 py-1.5 text-xs font-medium transition hover:border-gold"
                  >
                    Clear day highlight
                  </button>
                ) : undefined
              }
            />

            {!data.days?.length ? (
              <EmptyState icon={ReceiptText} title="No report data yet" description="Saved invoices will appear here by their business day." />
            ) : (
              <div className="max-h-[30rem] overflow-y-auto pr-1">
                <Table head={['Business day', 'Invoices', 'Income']}>
                  {ledgerDays.map((day) => (
                    <tr
                      key={day.businessDay}
                      className={`border-b border-hairline last:border-0 ${
                        selectedDay === day.businessDay
                          ? 'bg-gold-soft/70'
                          : day.businessDay === data.currentBusinessDay
                            ? 'bg-gold-soft/45'
                            : ''
                      }`}
                    >
                      <td className="py-3 font-medium">
                        {formatDay(day.businessDay)}{' '}
                        {day.businessDay === data.currentBusinessDay && (
                          <span className="ml-1 rounded-full bg-gold px-1.5 py-0.5 text-[9px] font-semibold text-slate-950 uppercase">
                            Today
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-muted-foreground">{day.count}</td>
                      <td className="tnum py-3 text-right font-semibold">{money(day.total)}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  )
}
