'use client'

// Motion helpers.
//
// All of these are CSS-driven (no animation library) and respect
// prefers-reduced-motion, so they cost almost nothing at runtime.

import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Fades and lifts a block into view on mount. */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <div className={`animate-rise-in ${className}`} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  )
}

/**
 * Counts a number up to its value.
 *
 * Uses requestAnimationFrame with an ease-out curve so the figure settles rather
 * than stopping dead. Skips animation entirely when motion is reduced, and when
 * the value is the same as before it does nothing — so a re-render caused by
 * clicking something unrelated does not re-animate the money.
 */
export function AnimatedNumber({
  value,
  format,
  durationMs = 650,
}: {
  value: number
  format: (value: number) => string
  durationMs?: number
}) {
  const [display, setDisplay] = useState(value)
  const previous = useRef(value)
  const frame = useRef<number | null>(null)

  useEffect(() => {
    const from = previous.current
    previous.current = value

    if (from === value) return

    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setDisplay(value)
      return
    }

    const start = performance.now()
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(from + (value - from) * eased)
      if (progress < 1) frame.current = requestAnimationFrame(step)
      else setDisplay(value)
    }

    frame.current = requestAnimationFrame(step)
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    }
  }, [value, durationMs])

  return <span className="tnum">{format(display)}</span>
}

/** Renders children only once `active` is true, fading them in. */
export function FadeIn({ active, children }: { active: boolean; children: ReactNode }) {
  if (!active) return null
  return <div className="animate-rise-in">{children}</div>
}

/** Skeleton that fades out as real content fades in, avoiding a hard swap. */
export function LoadingSwap({ loading, skeleton, children }: { loading: boolean; skeleton: ReactNode; children: ReactNode }) {
  if (loading) return <>{skeleton}</>
  return <div className="animate-rise-in">{children}</div>
}
