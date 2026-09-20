'use client'

// Monthly income reporting. The bars deliberately show zero-sales days too,
// which makes the midnight daily reset visible and keeps the monthly total
// auditable against the transaction ledger.

import { useMemo, useState } from 'react'
import { BarChart3, CalendarDays, CircleDollarSign, ReceiptText, TrendingUp } from 'lucide-react'
import { Card, EmptyState, Field, Input, SectionHeading, Skeleton, StatCard, Table, WorkspaceHero, formatDay, money } from '@/components/ui'
import { useApi } from '@/lib/use-api'
import { businessMonth } from '@/lib/business-time'
import type { Dashboard, MonthlyReport } from '@/lib/types'

const monthLabel = (value: string) => {
  const [year, month] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)))
}

export default function ReportsSection({ dashboard, dashboardLoading }: { dashboard: Dashboard | null; dashboardLoading: boolean }) {
  const [month, setMonth] = useState(() => businessMonth())
  const report = useApi<MonthlyReport>(`/api/reports?month=${encodeURIComponent(month)}`, { refreshInterval: 30_000 })
  const data = report.data
  const today = useMemo(() => data?.days.find((day) => day.businessDay === data.currentBusinessDay) ?? { businessDay: '', total: 0, count: 0 }, [data])
  const maxTotal = useMemo(() => Math.max(...(data?.days.map((day) => day.total) ?? [0]), 1), [data])
  const activeDays = data?.days.filter((day) => day.count > 0).length ?? 0

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHero
        eyebrow="Business intelligence"
        title="Income reports"
        description="Track daily income through the month, spot stronger trading days, and keep your all-time revenue separate from today’s live balance."
        action={<span className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-medium text-slate-100 backdrop-blur">India time · resets at 12:00 AM</span>}
      />

      <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <StatCard icon={CircleDollarSign} label="Monthly income" amount={data?.total ?? 0} hint={`${data?.count ?? 0} invoice${data?.count === 1 ? '' : 's'} recorded`} tone="gold" loading={report.isLoading} />
        <StatCard icon={ReceiptText} label="Income today" amount={today.total} hint={today.count ? `${today.count} invoice${today.count === 1 ? '' : 's'} today` : 'Fresh daily balance'} tone="success" loading={report.isLoading} />
        <StatCard icon={TrendingUp} label="All-time income" amount={dashboard?.allTotal ?? 0} hint={`${dashboard?.allCount ?? 0} invoice${dashboard?.allCount === 1 ? '' : 's'} retained`} loading={dashboardLoading} />
        <StatCard icon={BarChart3} label="Best day" amount={data?.bestDay.total ?? 0} hint={data?.bestDay.businessDay ? formatDay(data.bestDay.businessDay) : 'No sales yet'} tone="warn" loading={report.isLoading} />
      </section>

      <Card className="business-primary-card">
        <SectionHeading
          title="Daily income over month"
          description="Every calendar day is shown. A zero bar means there were no invoices on that business day."
          action={
            <div className="w-44">
              <Field label="Report month">
                <Input type="month" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} />
              </Field>
            </div>
          }
        />

        {report.error ? (
          <EmptyState icon={BarChart3} title="Could not load this report" description={report.error} />
        ) : report.isLoading ? (
          <div className="grid h-72 grid-cols-12 items-end gap-2 px-3">
            {Array.from({ length: 12 }).map((_, index) => <Skeleton key={index} className={`w-full ${index % 3 === 0 ? 'h-48' : index % 2 === 0 ? 'h-32' : 'h-20'}`} />)}
          </div>
        ) : data ? (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-hairline bg-secondary/45 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-medium"><CalendarDays className="size-4 text-gold-deep" /> {monthLabel(data.month)}</p>
              <p className="text-xs text-muted-foreground">{activeDays} of {data.days.length} days with sales · Average active day {money(data.average)} · Current-day balance refreshes automatically at midnight.</p>
            </div>
            <div className="overflow-x-auto pb-2">
              <div className="min-w-[660px]">
                <div className="flex h-60 items-end gap-1.5 border-b border-hairline px-1">
                  {data.days.map((day, index) => {
                    const percent = day.total > 0 ? Math.max((day.total / maxTotal) * 100, 4) : 2
                    const isToday = day.businessDay === data.currentBusinessDay
                    return (
                      <div key={day.businessDay} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${formatDay(day.businessDay)} · ${money(day.total)} · ${day.count} invoice${day.count === 1 ? '' : 's'}`}>
                        <div
                          className={`w-full rounded-t-md transition duration-200 group-hover:brightness-110 ${isToday ? 'bg-gold shadow-[0_0_0_2px_var(--gold-soft)]' : day.total > 0 ? 'bg-primary/82' : 'bg-secondary'}`}
                          style={{ height: `${percent}%` }}
                        />
                        <span className="pointer-events-none absolute right-1/2 bottom-2 z-10 hidden w-max translate-x-1/2 -translate-y-full rounded-lg bg-slate-950 px-2 py-1 text-[10px] text-white shadow-lg group-hover:block">
                          {formatDay(day.businessDay)} · {money(day.total)}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-2 flex gap-1.5 px-1 text-[10px] text-muted-foreground">
                  {data.days.map((day, index) => <span key={day.businessDay} className="min-w-0 flex-1 text-center">{index === 0 || index === data.days.length - 1 || (index + 1) % 5 === 0 ? index + 1 : ''}</span>)}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </Card>

      <Card>
        <SectionHeading title="Daily report ledger" description="A monthly, day-by-day audit trail generated from saved invoices." />
        {!data?.days?.length ? (
          <EmptyState icon={ReceiptText} title="No report data yet" description="Saved invoices will appear here by their business day." />
        ) : (
          <div className="max-h-[30rem] overflow-y-auto pr-1">
            <Table head={['Business day', 'Invoices', 'Income']}>
              {data.days.slice().reverse().map((day) => (
                <tr key={day.businessDay} className={`border-b border-hairline last:border-0 ${day.businessDay === data.currentBusinessDay ? 'bg-gold-soft/45' : ''}`}>
                  <td className="py-3 font-medium">{formatDay(day.businessDay)} {day.businessDay === data.currentBusinessDay && <span className="ml-1 rounded-full bg-gold px-1.5 py-0.5 text-[9px] font-semibold text-slate-950 uppercase">Today</span>}</td>
                  <td className="py-3 text-muted-foreground">{day.count}</td>
                  <td className="tnum py-3 text-right font-semibold">{money(day.total)}</td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Card>
    </div>
  )
}
