import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
// Imported from the Edge-safe module: middleware runs on the Edge runtime,
// which has no node:crypto.
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session-edge'

// Routes that require an admin session. Everything else stays public.
const PROTECTED_PAGES = ['/']
const PROTECTED_APIS = ['/api/items', '/api/transactions', '/api/dashboard', '/api/invoice', '/api/shop', '/api/logo', '/api/payments', '/api/profile']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const session = await verifySessionToken(token)

  const isApi = pathname.startsWith('/api/')
  const isProtected =
    PROTECTED_APIS.some((route) => pathname === route || pathname.startsWith(`${route}/`)) ||
    (!isApi && PROTECTED_PAGES.includes(pathname))

  // Signed-in admins have no reason to see the login screen again.
  if (pathname === '/admin-login' && session) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (!isProtected || session) return NextResponse.next()

  if (isApi) {
    return NextResponse.json({ error: 'Your session has expired. Please sign in again.' }, { status: 401 })
  }

  const loginUrl = new URL('/admin-login', request.url)
  loginUrl.searchParams.set('next', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/', '/admin-login', '/api/items/:path*', '/api/transactions/:path*', '/api/dashboard/:path*', '/api/invoice/:path*', '/api/shop/:path*', '/api/logo/:path*', '/api/payments/:path*', '/api/profile/:path*'],
}
