'use client'

// Route-level error boundary.
// Without this, an uncaught render error leaves the operator on a blank white
// screen with no way back — bad in a shop mid-sale.

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[v0] Unhandled error in the billing desk:', error)
  }, [error])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="card-shadow max-w-md rounded-3xl border-hairline bg-card p-8 text-center">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-warn-soft text-warn">
          <AlertTriangle className="size-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The billing desk hit an unexpected error. Your saved bills are safe — nothing was lost.
        </p>
        {error.digest && <p className="mt-2 text-xs text-muted-foreground/70">Reference: {error.digest}</p>}
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={reset}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            <RotateCcw className="size-4" /> Try again
          </button>
          <a
            href="/"
            className="inline-flex h-11 items-center rounded-xl border-hairline px-5 text-sm font-medium transition hover:bg-secondary"
          >
            Reload the desk
          </a>
        </div>
      </div>
    </main>
  )
}
