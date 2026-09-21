import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
// Imported from the Edge-safe module: middleware runs on the Edge runtime,
// which has no node:crypto.
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session-edge'

// Route map.
//
//   /                  public   the customer-facing website and online store
//   /track, /order/*   public   order lookup and the customer's tracking link
//   /admin             private  the billing desk and business workspace
//   /admin-login       public   the sign-in screen
//
// Only the business APIs are protected. The storefront APIs (catalogue, image,
// order placement, order tracking) are deliberately open — customers use them —
// which is why each of those routes filters on `published` itself rather than
// trusting the client.
const PROTECTED_PAGES = ['/admin']
const PROTECTED_APIS = [
  '/api/items',
  '/api/transactions',
  '/api/dashboard',
  '/api/invoice',
  '/api/shop',
  '/api/logo',
  '/api/payments',
  '/api/profile',
  // Admin-side order management. The public endpoints live under /api/store/*
  // and must NOT be listed here.
  '/api/orders',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const session = await verifySessionToken(token)

  const isApi = pathname.startsWith('/api/')
  const isProtected =
    PROTECTED_APIS.some((route) => pathname === route || pathname.startsWith(`${route}/`)) ||
    (!isApi && (PROTECTED_PAGES.includes(pathname) || pathname.startsWith('/admin/')))

  // Signed-in admins have no reason to see the login screen again — send them
  // to the desk, not back to the public shop.
  if (pathname === '/admin-login' && session) {
    return NextResponse.redirect(new URL('/admin', request.url))
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
  matcher: [
    '/admin',
    '/admin/:path*',
    '/admin-login',
    '/api/items/:path*',
    '/api/transactions/:path*',
    '/api/dashboard/:path*',
    '/api/invoice/:path*',
    '/api/shop/:path*',
    '/api/logo/:path*',
    '/api/payments/:path*',
    '/api/profile/:path*',
    '/api/orders',
    '/api/orders/:path*',
  ],
}
