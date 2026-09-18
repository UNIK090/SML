import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSessionToken, isAuthConfigured, sessionCookieOptions, SESSION_COOKIE, verifyPassword } from '@/lib/auth'

// A dummy hash keeps the failed-login path doing real work, so response time
// does not reveal whether the submitted email was the right one.
const DUMMY_HASH = 'scrypt:00000:'.padEnd(140, '0')

export async function POST(request: Request) {
  try {
    if (!isAuthConfigured()) {
      console.error('[auth] Missing ADMIN_EMAIL, ADMIN_PASSWORD_HASH, or SESSION_SECRET.')
      return NextResponse.json(
        { error: 'Admin sign-in is not configured yet. Set the admin environment variables.' },
        { status: 503 },
      )
    }

    const body = await request.json().catch(() => ({}))
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!email || !password) {
      return NextResponse.json({ error: 'Enter your email address and password.' }, { status: 400 })
    }

    const expectedEmail = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase()
    const emailMatches = email === expectedEmail
    const passwordMatches = verifyPassword(password, emailMatches ? process.env.ADMIN_PASSWORD_HASH! : DUMMY_HASH)

    if (!emailMatches || !passwordMatches) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
    }

    const token = await createSessionToken(expectedEmail)
    if (!token) {
      return NextResponse.json({ error: 'Could not start a session. Check SESSION_SECRET.' }, { status: 503 })
    }

    const store = await cookies()
    store.set(SESSION_COOKIE, token, sessionCookieOptions)
    return NextResponse.json({ email: expectedEmail })
  } catch (error) {
    console.error('[auth] Sign-in failed:', error)
    return NextResponse.json({ error: 'Could not sign you in. Please try again.' }, { status: 500 })
  }
}
