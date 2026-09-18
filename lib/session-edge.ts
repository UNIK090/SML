// Edge-safe session verification.
//
// middleware.ts runs on the Edge runtime, which has no `node:crypto`, so the
// Node-based helpers in lib/auth.ts cannot be imported there. This module uses
// the Web Crypto API instead, which both the Edge runtime and Node provide.
//
// Verification is all the middleware needs. Minting sessions stays server-side
// in lib/auth.ts, where scrypt password checking lives.

export const SESSION_COOKIE = 'aurum_session'

export type Session = { email: string; expiresAt: number }

function base64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function sessionSecret(): string | null {
  const value = process.env.SESSION_SECRET
  return value && value.length >= 16 ? value : null
}

async function signPayload(payload: string): Promise<string | null> {
  const secret = sessionSecret()
  if (!secret) return null
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return bytesToBase64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))
}

/** Constant-time string comparison that does not leak length through early exit. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

/** Returns the session when the signature is valid and unexpired, otherwise null. */
export async function verifySessionToken(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null
  const separator = token.lastIndexOf('.')
  if (separator < 1) return null

  const payload = token.slice(0, separator)
  const provided = token.slice(separator + 1)
  const expected = await signPayload(payload)
  if (!expected || !safeEqual(provided, expected)) return null

  try {
    const session = JSON.parse(new TextDecoder().decode(base64urlToBytes(payload))) as Session
    if (typeof session?.email !== 'string' || typeof session?.expiresAt !== 'number') return null
    if (session.expiresAt < Date.now()) return null
    return session
  } catch {
    return null
  }
}
