// Shared UI primitives.
//
// Deliberately small and unopinionated: the sections compose these rather than
// each re-inventing card/badge/table markup, which is what made the old single
// dashboard component so long.

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AnimatedNumber } from '@/components/motion'

export const money = (value: number) =>
  `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Postgres `date` values arrive as "2026-09-17"; render without a timezone shift. */
export const formatDay = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

export function SectionHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card-shadow rounded-2xl border-hairline bg-card p-6 ${className}`}>{children}</section>
}

export function Button({
  children,
  variant = 'primary',
  type = 'button',
  ...rest
}: {
  children: ReactNode
  variant?: 'primary' | 'outline' | 'ghost' | 'gold' | 'success' | 'danger'
  type?: 'button' | 'submit'
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles: Record<string, string> = {
    primary: 'bg-primary text-primary-foreground hover:opacity-90',
    gold: 'bg-gold text-white hover:opacity-90',
    success: 'bg-success text-white hover:opacity-90',
    danger: 'border-hairline bg-card text-destructive hover:bg-red-50',
    outline: 'border-hairline bg-card text-foreground hover:bg-secondary',
    ghost: 'text-muted-foreground hover:bg-secondary hover:text-foreground',
  }
  const sizes = variant === 'ghost' ? 'h-9 px-3 text-sm' : 'h-11 px-5 text-sm'
  return (
    <button
      type={type}
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:pointer-events-none disabled:opacity-55 ${styles[variant]} ${sizes} ${rest.className ?? ''}`}
    >
      {children}
    </button>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-11 w-full rounded-xl border-hairline bg-card px-3 text-sm transition placeholder:text-muted-foreground/70 ${props.className ?? ''}`}
    />
  )
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-11 w-full rounded-xl border-hairline bg-card px-3 text-sm transition ${props.className ?? ''}`}
    />
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warn' | 'gold' }) {
  const tones: Record<string, string> = {
    neutral: 'bg-secondary text-muted-foreground',
    success: 'bg-success-soft text-success',
    warn: 'bg-warn-soft text-warn',
    gold: 'bg-gold-soft text-gold-deep',
  }
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>
}

export function StatCard({
  icon: Icon,
  label,
  value,
  amount,
  hint,
  tone = 'neutral',
  loading = false,
}: {
  icon: LucideIcon
  label: string
  /** Pre-formatted display string. Ignored when `amount` is supplied. */
  value?: string
  /** Numeric value that animates up to its total. */
  amount?: number
  hint: string
  tone?: 'neutral' | 'gold' | 'success' | 'warn'
  loading?: boolean
}) {
  const iconTone: Record<string, string> = {
    neutral: 'bg-secondary text-muted-foreground',
    gold: 'bg-gold-soft text-gold-deep',
    success: 'bg-success-soft text-success',
    warn: 'bg-warn-soft text-warn',
  }

  if (loading) {
    return (
      <div className="card-shadow rounded-2xl border-hairline bg-card p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="size-8 rounded-lg" />
        </div>
        <Skeleton className="mb-2 h-7 w-28" />
        <Skeleton className="h-3 w-24" />
      </div>
    )
  }

  return (
    <div className="card-shadow min-w-0 rounded-2xl border-hairline bg-card p-5 transition-shadow hover:shadow-[var(--shadow-lg)]">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${iconTone[tone]}`}>
          <Icon className="size-4" />
        </span>
      </div>
      {/* The value must never wrap or overlap the icon on large amounts. */}
      <p className="text-xl font-semibold tracking-tight whitespace-nowrap sm:text-2xl">
        {amount === undefined ? <span className="tnum">{value}</span> : <AnimatedNumber value={amount} format={money} />}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-dashed border-hairline px-6 py-12 text-center">
      <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>}
    </div>
  )
}

export function Notice({ children, tone = 'gold' }: { children: ReactNode; tone?: 'gold' | 'danger' | 'success' }) {
  const tones: Record<string, string> = {
    gold: 'bg-gold-soft text-gold-deep',
    success: 'bg-success-soft text-success',
    danger: 'bg-red-50 text-red-700',
  }
  return <p role={tone === 'danger' ? 'alert' : undefined} className={`rounded-xl px-4 py-3 text-sm ${tones[tone]}`}>{children}</p>
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-hairline text-xs tracking-wider text-muted-foreground uppercase">
            {head.map((label, index) => (
              <th key={label} className={`pb-3 font-medium ${index === head.length - 1 ? 'text-right' : ''}`}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
/** Shimmering placeholder block used while data loads. */
export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={`shimmer rounded-md bg-secondary ${className}`} aria-hidden />
}

/** A card-shaped skeleton for table and list placeholders. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  )
}

/** A row of stat-card skeletons. */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="card-shadow rounded-2xl border-hairline bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
          <Skeleton className="mb-2 h-6 w-28" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  )
}
