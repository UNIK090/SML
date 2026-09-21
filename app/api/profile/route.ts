import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { shopProfile } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { getShopDetails, getShopDetailsFromEnv, PROFILE_ID } from '@/lib/shop'
import { hashPassword, verifyPassword } from '@/lib/auth'
import { randomBytes } from 'node:crypto'
import { getInvoiceDeliveryStatus, getSmsDeliveryStatus } from '@/lib/messaging'

/** Current shop profile, plus whether it is overridden by the environment. */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const [row] = await db.select().from(shopProfile).where(eq(shopProfile.id, PROFILE_ID))
    return NextResponse.json({
      profile: await getShopDetails(),
      saved: row ?? null,
      fromEnv: getShopDetailsFromEnv(),
      adminEmail: process.env.ADMIN_EMAIL ?? null,
      invoiceDelivery: getInvoiceDeliveryStatus(),
      smsDelivery: getSmsDeliveryStatus(),
    })
  } catch (error) {
    console.error('[v0] Failed to load profile:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not load the profile.' }, { status: 500 })
  }
}

/** Saves the shop details. */
export async function PATCH(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = await request.json()

    // Changing the admin password is a separate concern but shares this screen.
    if (body.action === 'password') {
      const current = typeof body.currentPassword === 'string' ? body.currentPassword : ''
      const next = typeof body.newPassword === 'string' ? body.newPassword : ''

      if (!current || !next) return NextResponse.json({ error: 'Enter your current and new password.' }, { status: 400 })
      if (next.length < 8) return NextResponse.json({ error: 'The new password must be at least 8 characters.' }, { status: 400 })

      const storedHash = process.env.ADMIN_PASSWORD_HASH
      if (!storedHash) return NextResponse.json({ error: 'No admin password is configured.' }, { status: 503 })
      if (!verifyPassword(current, storedHash)) return NextResponse.json({ error: 'Your current password is incorrect.' }, { status: 401 })
      if (verifyPassword(next, storedHash)) return NextResponse.json({ error: 'Choose a password different from the current one.' }, { status: 400 })

      // A password change cannot be persisted for the running process, because
      // the hash lives in .env.local. Return the new hash for the operator to
      // install, which is both explicit and safe.
      const newHash = hashPassword(next)
      return NextResponse.json({
        passwordReady: true,
        newHash,
        newSecret: randomBytes(32).toString('base64url'),
        advice: 'Paste these into .env.local and restart the server to apply the new password.',
      })
    }

    // Otherwise: shop details.
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return NextResponse.json({ error: 'A shop name is required.' }, { status: 400 })

    const cleanOrNull = (value: unknown, max: number) => {
      if (typeof value !== 'string') return null
      const trimmed = value.trim()
      return trimmed ? trimmed.slice(0, max) : null
    }

    const gstin = cleanOrNull(body.gstin, 20)?.toUpperCase() ?? null
    // A GSTIN is 15 characters: 2 digits, 10 chars, 1 digit, 1 letter, 1 char.
    if (gstin && !/^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]{3}$/.test(gstin)) {
      return NextResponse.json({ error: 'That GSTIN does not look valid. It should be 15 characters.' }, { status: 400 })
    }

    const values = {
      id: PROFILE_ID,
      name: name.slice(0, 120),
      address: cleanOrNull(body.address, 300),
      phone: cleanOrNull(body.phone, 20),
      email: cleanOrNull(body.email, 160),
      gstin,
      // Storefront copy. `null` deliberately clears a field rather than keeping
      // a stale value, because this is a full profile save.
      tagline: cleanOrNull(body.tagline, 160),
      whatsapp: cleanOrNull(body.whatsapp, 200),
      storeHours: cleanOrNull(body.storeHours, 120),
      updatedAt: new Date(),
    }

    await db.insert(shopProfile).values(values).onConflictDoUpdate({ target: shopProfile.id, set: values })
    return NextResponse.json({ profile: await getShopDetails() })
  } catch (error) {
    console.error('[v0] Failed to save profile:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not save the profile.' }, { status: 500 })
  }
}
