import { cookies } from 'next/headers'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

/**
 * Defence in depth: middleware already blocks unauthenticated requests to the
 * protected APIs, but each route checks again so a middleware misconfiguration
 * cannot silently expose the billing data.
 *
 * Returns a 401 response when the caller has no valid session, or null to continue.
 */
export async function requireAdmin(): Promise<Response | null> {
  const store = await cookies()
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value)
  if (session) return null
  return Response.json({ error: 'Your session has expired. Please sign in again.' }, { status: 401 })
}
