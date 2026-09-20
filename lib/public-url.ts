// Builds customer-facing receipt links without trusting a client-supplied URL.
// APP_PUBLIC_URL is useful for a custom domain; otherwise Vercel's forwarded
// host gives the same origin that served the authenticated billing request.

function cleanOrigin(value: string | undefined): string | null {
  const origin = value?.trim().replace(/\/+$/, '')
  return origin && /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin) ? origin : null
}

export function publicInvoiceUrl(request: Request, token: string | null | undefined): string | null {
  if (!token) return null

  const configured = cleanOrigin(process.env.APP_PUBLIC_URL)
  if (configured) return `${configured}/invoice/${encodeURIComponent(token)}`

  const host = (request.headers.get('x-forwarded-host') ?? request.headers.get('host'))?.split(',')[0]?.trim()
  if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return null
  const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() === 'http' ? 'http' : 'https'
  return `${protocol}://${host}/invoice/${encodeURIComponent(token)}`
}
