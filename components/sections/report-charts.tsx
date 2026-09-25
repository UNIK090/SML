'use client'

// ===========================================================================
// Charts for the Reports screen.
//
// Deliberately hand-built from SVG and CSS rather than pulling in a charting
// library: the whole app ships four dependencies and adding a 100 KB chart
// engine for three small graphics would be a poor trade. Every chart here is
// also readable without colour, and each carries its numbers as text, because
// a shopkeeper checking a total against the ledger needs the figure, not just
// the shape.
//
// Each chart hides itself when it has nothing to say. An empty donut ring or a
// row of zero bars looks like a broken page; a section that quietly steps aside
// reads as a quiet month.
// ===========================================================================

import { useMemo, useState } from 'react'
import type { ReportSlice, WeekdayStat } from '@/lib/types'

/** Money with no paise, for chart axis and tooltips where space is tight. */
const compact = (value: number) =>
  value >= 10_000_000
    ? `₹${(value / 10_000_000).toFixed(1)}Cr`
    : value >= 100_000
      ? `₹${(value / 100_000).toFixed(1)}L`
      : value >= 1_000
        ? `₹${(value / 1_000).toFixed(1)}K`
        : `₹${Math.round(value)}`

/* ---------------------------------------------------------------------------
   Donut — the share-of-income chart
   --------------------------------------------------------------------------- */

/**
 * A ring split by share of income.
 *
 * Built from `stroke-dasharray` on a circle rather than path arcs, because
 * dash offsets are far easier to get right across arbitrary slice counts and
 * cannot produce the hairline gaps that hand-computed arcs do at small angles.
 *
 * Slices under ~2% are still drawn but the legend carries the exact figure, so
 * a tiny category is never silently invisible.
 */
export function DonutChart({
  slices,
  title,
  centerLabel,
  centerValue,
}: {
  slices: ReportSlice[]
  title: string
  centerLabel: string
  centerValue: string
}) {
  const [active, setActive] = useState<number | null>(null)

  if (slices.length === 0) return null

  // Ring geometry: a 120-unit box with a 46-unit radius leaves room for the
  // stroke and keeps the centre clear for the total.
  const radius = 46
  const circumference = 2 * Math.PI * radius

  let offset = 0
  const arcs = slices.map((slice, index) => {
    const length = (slice.share / 100) * circumference
    const arc = { slice, index, length, offset }
    offset += length
    return arc
  })

  const shown = active !== null ? slices[active] : null

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative mx-auto shrink-0 sm:mx-0">
        <svg viewBox="0 0 120 120" className="size-40 -rotate-90" role="img" aria-label={title}>
          {/* The track, so an unfilled ring still reads as a chart. */}
          <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--secondary)" strokeWidth="13" />
          {arcs.map(({ slice, index, length, offset: start }) => (
            <circle
              key={slice.label}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={`var(--chart-${(index % 5) + 1})`}
              strokeWidth={active === index ? 15 : 13}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-start}
              className="cursor-pointer transition-all duration-200"
              opacity={active === null || active === index ? 1 : 0.35}
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
        </svg>

        {/* The centre reads either the period total or the hovered slice. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          <span className="text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            {shown ? shown.label : centerLabel}
          </span>
          <span className="tnum mt-0.5 text-lg font-semibold">{shown ? compact(shown.total) : centerValue}</span>
          {shown && <span className="tnum text-[10px] text-muted-foreground">{shown.share.toFixed(1)}%</span>}
        </div>
      </div>

      {/* The legend carries the exact numbers, so the chart is never the only
          place a figure can be read. */}
      <ul className="min-w-0 flex-1 space-y-2">
        {slices.map((slice, index) => (
          <li
            key={slice.label}
            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition"
            style={{ background: active === index ? 'var(--secondary)' : 'transparent' }}
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: `var(--chart-${(index % 5) + 1})` }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{slice.label}</span>
            <span className="tnum shrink-0 text-xs text-muted-foreground">{slice.share.toFixed(1)}%</span>
            <span className="tnum shrink-0 text-xs font-semibold">{compact(slice.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------------------------------------------------------------------------
   Weekday pattern
   --------------------------------------------------------------------------- */

/**
 * Average income per weekday.
 *
 * This is the chart that answers "when should I staff up and stock up?". The
 * strongest day is highlighted rather than annotated, and every bar carries its
 * average as text underneath, so the pattern survives being printed in black
 * and white.
 */
export function WeekdayChart({ weekdays }: { weekdays: WeekdayStat[] }) {
  const max = Math.max(...weekdays.map((day) => day.average), 1)
  const best = weekdays.reduce((top, day) => (day.average > top.average ? day : top), weekdays[0])

  // Nothing sold all month means there is no pattern to draw.
  if (weekdays.every((day) => day.average === 0)) return null

  return (
    <div>
      <div className="flex h-40 items-end gap-1.5 sm:gap-2" role="img" aria-label="Average income by weekday">
        {weekdays.map((day) => {
          const percent = day.average > 0 ? Math.max((day.average / max) * 100, 3) : 0
          const isBest = day.weekday === best.weekday && best.average > 0
          return (
            <div key={day.weekday} className="group flex h-full min-w-0 flex-1 flex-col justify-end">
              <span className="tnum mb-1 text-center text-[9px] font-semibold opacity-0 transition group-hover:opacity-100">
                {day.average > 0 ? compact(day.average) : ''}
              </span>
              <div
                className="w-full rounded-t-md transition duration-200 group-hover:brightness-110"
                style={{
                  height: `${percent}%`,
                  background: isBest ? 'var(--gold)' : 'var(--primary)',
                  opacity: day.average > 0 ? 0.9 : 0,
                  boxShadow: isBest ? '0 0 0 2px var(--gold-soft)' : undefined,
                }}
                title={`${day.label} · avg ${compact(day.average)} · ${day.count} invoice${day.count === 1 ? '' : 's'}`}
              />
            </div>
          )
        })}
      </div>

      <div className="mt-2 flex gap-1.5 border-t border-hairline pt-2 sm:gap-2">
        {weekdays.map((day) => (
          <span key={day.weekday} className="min-w-0 flex-1 text-center text-[10px] text-muted-foreground">
            {day.label.slice(0, 3)}
          </span>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Strongest day is{' '}
        <span className="font-semibold text-foreground">
          {best.label} ({compact(best.average)} average)
        </span>
        . Averaged over the days that traded, so a closed day is not counted as a weak one.
      </p>
    </div>
  )
}

/* ---------------------------------------------------------------------------
   Activity strip
   --------------------------------------------------------------------------- */

/**
 * One square per day, shaded by how much was sold.
 *
 * The month at a glance — which is what a shopkeeper actually wants from a
 * month view, and something a bar chart cannot give without scrolling. Shading
 * is scaled against the month's own best day, so a small shop's quiet month
 * still shows contrast instead of washing out to uniform pale.
 */
export function ActivityStrip({
  days,
  currentBusinessDay,
  onSelect,
  selected,
}: {
  days: { businessDay: string; total: number; count: number }[]
  currentBusinessDay: string
  onSelect?: (businessDay: string) => void
  selected?: string | null
}) {
  const max = useMemo(() => Math.max(...days.map((day) => day.total), 1), [days])
  if (days.length === 0) return null

  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {days.map((day) => {
          const intensity = day.total > 0 ? 0.15 + (day.total / max) * 0.85 : 0
          const isToday = day.businessDay === currentBusinessDay
          const isSelected = day.businessDay === selected
          const dayNumber = Number(day.businessDay.slice(-2))
          return (
            <button
              key={day.businessDay}
              type="button"
              onClick={() => day.count > 0 && onSelect?.(day.businessDay)}
              disabled={day.count === 0}
              title={`${day.businessDay} · ${day.count} invoice${day.count === 1 ? '' : 's'} · ${day.total.toLocaleString('en-IN')}`}
              aria-label={`Day ${dayNumber}, ${day.count} invoices`}
              className="tnum flex size-7 items-center justify-center rounded-md text-[10px] font-medium transition sm:size-8 sm:text-[11px]"
              style={{
                background: day.total > 0 ? `color-mix(in oklab, var(--gold) ${Math.round(intensity * 100)}%, transparent)` : 'var(--secondary)',
                color: intensity > 0.5 ? 'oklch(0.22 0.04 258)' : 'var(--muted-foreground)',
                outline: isToday ? '2px solid var(--ring)' : isSelected ? '2px solid var(--primary)' : 'none',
                outlineOffset: '1px',
                cursor: day.count > 0 ? 'pointer' : 'default',
              }}
            >
              {dayNumber}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((step) => (
          <span
            key={step}
            className="size-3 rounded-sm"
            style={{
              background: step === 0 ? 'var(--secondary)' : `color-mix(in oklab, var(--gold) ${Math.round(step * 100)}%, transparent)`,
            }}
            aria-hidden
          />
        ))}
        <span>More</span>
        <span className="ml-auto">Tap a day to highlight it in the ledger below.</span>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
   Trend pill
   --------------------------------------------------------------------------- */

/**
 * Year-on-year change.
 *
 * Renders nothing at all when there is no comparable month, rather than
 * showing "0%" or a dash that a shopkeeper might misread as flat trading.
 */
export function TrendPill({ changePct, previousTotal }: { changePct: number | null; previousTotal: number }) {
  if (changePct === null || previousTotal === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        No same month last year
      </span>
    )
  }

  const up = changePct >= 0
  return (
    <span
      className={`tnum inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${up ? 'bg-success-soft text-success' : 'bg-destructive/10 text-destructive'
        }`}
    >
      {up ? '▲' : '▼'} {Math.abs(changePct).toFixed(1)}%
      <span className="font-normal opacity-80">vs last year</span>
    </span>
  )
}