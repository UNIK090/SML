// Session handling for the admin area.
//
// Uses only Node built-ins (node:crypto), so no new dependencies are required.
//
// Design notes:
// - Passwords are stored as a scrypt hash in ADMIN_PASSWORD_HASH, never in plain
//   text and never in client-side JavaScript.
// - The session cookie carries the payload and an HMAC signature. It is signed
//   with SESSION_SECRET, so a visitor cannot mint one by editing the cookie.
//   The signature is compared with timingSafeEqual to avoid leaking it byte by byte.
//
// This file is server-only; it is imported exclusively from route handlers and
// middleware. Keep it that way.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { SESSION_COOKIE, sessionSecret, verifySessionToken as verifyEdge, type Session } from './session-edge'

export { SESSION_COOKIE }
export type { Session }

const SESSION_TTL_MS = 1000 * 60 * 60 * 8 // 8 hours
// Signing uses Web Crypto (shared with middleware.ts) so both runtimes agree on
// the exact bytes. Password hashing below keeps node:crypto scrypt, which is fine
// because that only ever runs in the Node.js runtime.
const encoder = new TextEncoder()

function secret(): string | null {
  return sessionSecret()
}

function bytesToBase64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function signHmac(payload: string): Promise<string | null> {
  const key = secret()
  if (!key) return null
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return bytesToBase64url(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(payload)))
}

/** True when the environment is configured well enough to sign anyone in. */
export function isAuthConfigured(): boolean {
  return Boolean(secret() && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD_HASH)
}

/** Builds a signed cookie value for the given admin email. */
export async function createSessionToken(email: string): Promise<string | null> {
  const payload = Buffer.from(JSON.stringify({ email, expiresAt: Date.now() + SESSION_TTL_MS })).toString('base64url')
  const signature = await signHmac(payload)
  if (!signature) return null
  return `${payload}.${signature}`
}

/** Returns the session if the signature is valid and it has not expired, else null. */
export async function verifySessionToken(token: string | undefined | null): Promise<Session | null> {
  return verifyEdge(token)
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  maxAge: SESSION_TTL_MS / 1000,
}

/**
 * Hashes a password with scrypt for storage in ADMIN_PASSWORD_HASH.
 * Format: scrypt:<salt-hex>:<derived-key-hex>
 * Used by scripts/set-admin-password.mjs; also handy for tests.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, 64)
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`
}

/** Constant-time comparison of a candidate password against a stored hash. */
export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, saltHex, keyHex] = parts
  try {
    const salt = Buffer.from(saltHex, 'hex')
    const expected = Buffer.from(keyHex, 'hex')
    const actual = scryptSync(password, salt, expected.length)
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
