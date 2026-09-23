import { NextResponse } from 'next/server'
import { desc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { isConnectionError, isUniqueViolation } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { inventoryItems } from '@/lib/db/schema'

// Never include base64 image data in the catalogue list: a grid of product
// cards should stay fast even when each item has a photo. The image endpoint
// serves only the specific image a browser actually renders.
const itemFields = {
  id: inventoryItems.id,
  code: inventoryItems.code,
  barcode: inventoryItems.barcode,
  name: inventoryItems.name,
  category: inventoryItems.category,
  price: inventoryItems.price,
  imageMimeType: inventoryItems.imageMimeType,
  imageByteSize: inventoryItems.imageByteSize,
  // Storefront listing fields. They travel with the catalogue response so the
  // Items screen can show one badge and the Store screen can edit them without
  // a second endpoint.
  published: inventoryItems.published,
  storePrice: inventoryItems.storePrice,
  description: inventoryItems.description,
  collection: inventoryItems.collection,
  badge: inventoryItems.badge,
  featured: inventoryItems.featured,
  updatedAt: inventoryItems.updatedAt,
}

type SelectedItem = {
  imageMimeType: string | null
  imageByteSize: number | null
  updatedAt: Date
  id: number
  code: number
  barcode: string | null
  name: string
  category: string
  price: string
  published: boolean
  storePrice: string | null
  description: string | null
  collection: string | null
  badge: string | null
  featured: number
}

function baseItemResponse(item: SelectedItem) {
  const { imageMimeType, imageByteSize, updatedAt, ...safe } = item
  return { ...safe, image: Boolean(imageMimeType && imageByteSize), imageVersion: updatedAt.toISOString() }
}

/**
 * Normalises the storefront half of an item payload.
 *
 * Absent fields are left untouched (undefined) so a publish toggle from the
 * Store screen does not wipe the description a moment later.
 */
function storeFields(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {}
  if (typeof body.published === 'boolean') patch.published = body.published
  if (body.storePrice !== undefined) {
    if (body.storePrice === null || body.storePrice === '') {
      patch.storePrice = null
    } else {
      const value = Number(body.storePrice)
      if (!Number.isFinite(value) || value < 0) return { error: 'Enter a valid website price.' }
      patch.storePrice = value.toFixed(2)
    }
  }
  if (body.description !== undefined) {
    patch.description = typeof body.description === 'string' && body.description.trim() ? body.description.trim().slice(0, 600) : null
  }
  if (body.collection !== undefined) {
    patch.collection = typeof body.collection === 'string' && body.collection.trim() ? body.collection.trim().slice(0, 80) : null
  }
  if (body.badge !== undefined) {
    patch.badge = typeof body.badge === 'string' && body.badge.trim() ? body.badge.trim().slice(0, 24) : null
  }
  if (body.featured !== undefined) {
    const value = Number(body.featured)
    patch.featured = Number.isFinite(value) ? Math.trunc(value) : 0
  }
  return { patch }
}

export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const params = new URL(request.url).searchParams
    const code = params.get('code')
    const barcode = params.get('barcode')?.trim()
    const search = params.get('q')?.trim()

    if (code) {
      const rows = await db.select(itemFields).from(inventoryItems).where(eq(inventoryItems.code, Number(code)))
      return NextResponse.json(rows.map(baseItemResponse))
    }

    // A scanner sends the raw barcode string; match it exactly so an EAN/UPC
    // value with leading zeroes resolves to the right catalogue item.
    if (barcode) {
      const rows = await db.select(itemFields).from(inventoryItems).where(eq(inventoryItems.barcode, barcode))
      return NextResponse.json(rows.map(baseItemResponse))
    }

    // Free-text search across name and category, so staff are not required to
    // remember numeric codes. A purely numeric query also matches the code exactly.
    if (search) {
      const pattern = `%${search}%`
      const numeric = Number(search)
      const items = await db
        .select(itemFields)
        .from(inventoryItems)
        .where(
          or(
            ilike(inventoryItems.name, pattern),
            ilike(inventoryItems.category, pattern),
            ilike(inventoryItems.barcode, pattern),
            Number.isInteger(numeric) ? eq(inventoryItems.code, numeric) : sql`false`,
          ),
        )
        .orderBy(inventoryItems.name)
        .limit(20)
      return NextResponse.json(items.map(baseItemResponse))
    }

    const items = await db.select(itemFields).from(inventoryItems).orderBy(desc(inventoryItems.updatedAt))
    return NextResponse.json(items.map(baseItemResponse))
  } catch (error) {
    console.error('[v0] Failed to load catalogue items:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not load the item catalogue.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
    const id = Number(body.id)
    const code = Number(body.code)
    const price = Number(body.price)
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const category = typeof body.category === 'string' ? body.category.trim() : ''
    const barcode = typeof body.barcode === 'string' && body.barcode.trim() ? body.barcode.trim() : null
    if (!Number.isInteger(id) || !Number.isInteger(code) || !name || !category || !Number.isFinite(price) || price < 0) return NextResponse.json({ error: 'Enter valid item details.' }, { status: 400 })
    const store = storeFields(body)
    if (store.error) return NextResponse.json({ error: store.error }, { status: 400 })
    const [item] = await db
      .update(inventoryItems)
      .set({ code, barcode, name, category, price: price.toFixed(2), ...store.patch, updatedAt: new Date() })
      .where(eq(inventoryItems.id, id))
      .returning(itemFields)
    if (!item) return NextResponse.json({ error: 'Catalogue item not found.' }, { status: 404 })
    return NextResponse.json(baseItemResponse(item))
  } catch (error) {
    console.error('[v0] Failed to update catalogue item:', error)
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: `Code ${Number(body.code)} (or its barcode) is already used by another catalogue item.` }, { status: 409 })
    }
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not update the catalogue item.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const id = Number(new URL(request.url).searchParams.get('id'))
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid catalogue item.' }, { status: 400 })
    const [item] = await db.delete(inventoryItems).where(eq(inventoryItems.id, id)).returning()
    if (!item) return NextResponse.json({ error: 'Catalogue item not found.' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[v0] Failed to delete catalogue item:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not delete the catalogue item.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
    const code = Number(body.code)
    const price = Number(body.price)
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const category = typeof body.category === 'string' ? body.category.trim() : ''
    const barcode = typeof body.barcode === 'string' && body.barcode.trim() ? body.barcode.trim() : null
    if (!Number.isInteger(code) || !name || !category || !Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: 'Enter a valid code, name, category, and price.' }, { status: 400 })
    }

    const store = storeFields(body)
    if (store.error) return NextResponse.json({ error: store.error }, { status: 400 })
    const [item] = await db
      .insert(inventoryItems)
      .values({ code, barcode, name, category, price: price.toFixed(2), ...store.patch })
      .returning(itemFields)
    return NextResponse.json(baseItemResponse(item), { status: 201 })
  } catch (error) {
    console.error('[v0] Failed to add catalogue item:', error)
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: `Code ${Number(body.code)} (or its barcode) is already in use. Choose a different one.` }, { status: 409 })
    }
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not save the catalogue item.' }, { status: 500 })
  }
}
