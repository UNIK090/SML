// Shop details printed on every invoice.
//
// Two sources, in priority order:
//   1. the shop_profile row, edited from the Profile screen at runtime
//   2. SHOP_* environment variables, the initial/fallback values
//
// A field is used only if it has a non-empty value. Nothing is invented — a
// blank stays blank and is simply omitted from the printed bill.

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { shopProfile } from '@/lib/db/schema'

export type ShopDetails = {
  name: string
  address: string | null
  phone: string | null
  email: string | null
  gstin: string | null
  /** Storefront copy: a one-line promise under the shop name. */
  tagline: string | null
  /** Number or wa.me URL used by the "Order on WhatsApp" buttons. */
  whatsapp: string | null
  /** Free text such as "Mon–Sat · 10:00 am – 8:30 pm". */
  storeHours: string | null
}

export const PROFILE_ID = 1

export const DEFAULT_SHOP_NAME = 'SRI MAHA LAXMI JEWELLERS'

const clean = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** Values from .env.local. Used when a profile field is empty. */
export function getShopDetailsFromEnv(): ShopDetails {
  return {
    name: clean(process.env.SHOP_NAME) ?? DEFAULT_SHOP_NAME,
    address: clean(process.env.SHOP_ADDRESS),
    phone: clean(process.env.SHOP_PHONE),
    email: clean(process.env.SHOP_EMAIL),
    gstin: clean(process.env.SHOP_GSTIN),
    tagline: clean(process.env.SHOP_TAGLINE),
    whatsapp: clean(process.env.SHOP_WHATSAPP),
    storeHours: clean(process.env.SHOP_HOURS),
  }
}

/**
 * The effective shop details: the saved profile when present, otherwise the
 * environment. Falls back to the environment if the database is unreachable, so
 * billing never breaks because of a profile lookup.
 */
export async function getShopDetails(): Promise<ShopDetails> {
  const env = getShopDetailsFromEnv()
  try {
    const [row] = await db.select().from(shopProfile).where(eq(shopProfile.id, PROFILE_ID))
    if (!row) return env
    return {
      name: clean(row.name) ?? env.name,
      address: clean(row.address) ?? env.address,
      phone: clean(row.phone) ?? env.phone,
      email: clean(row.email) ?? env.email,
      gstin: clean(row.gstin) ?? env.gstin,
      tagline: clean(row.tagline) ?? env.tagline,
      whatsapp: clean(row.whatsapp) ?? env.whatsapp,
      storeHours: clean(row.storeHours) ?? env.storeHours,
    }
  } catch (error) {
    console.error('[v0] Falling back to environment shop details:', error)
    return env
  }
}
