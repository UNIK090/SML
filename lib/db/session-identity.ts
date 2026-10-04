import { cookies } from 'next/headers'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

/**
 * Who is performing an action, for the audit trail.
 *
 * Every reward movement records a `createdBy`. That value has to come from the
 * verified session and never from the request body — a client-supplied name would
 * let anyone attribute a credit to somebody else, and an audit trail that can be
 * written by the person it is auditing is not an audit trail at all.
 *
 * Falls back to a fixed label rather than an empty string, so a ledger row is
 * never written with no attribution at all.
 */
export async function getSessionIdentity(): Promise<string> {
  try {
    const store = await cookies()
    const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value)
    return session?.email?.trim() || 'admin'
  } catch {
    return 'admin'
  }
}