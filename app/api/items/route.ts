import { NextResponse } from 'next/server'
import { desc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { isConnectionError, isUniqueViolation } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { inventoryItems } from '@/lib/db/schema'

export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const params = new URL(request.url).searchParams
    const code = params.get('code')
    const search = params.get('q')?.trim()

    if (code) {
      return NextResponse.json(await db.select().from(inventoryItems).where(eq(inventoryItems.code, Number(code))))
    }

    // Free-text search across name and category, so staff are not required to
    // remember numeric codes. A purely numeric query also matches the code exactly.
    if (search) {
      const pattern = `%${search}%`
      const numeric = Number(search)
      const items = await db
        .select()
        .from(inventoryItems)
        .where(
          or(
            ilike(inventoryItems.name, pattern),
            ilike(inventoryItems.category, pattern),
            Number.isInteger(numeric) ? eq(inventoryItems.code, numeric) : sql`false`,
          ),
        )
        .orderBy(inventoryItems.name)
        .limit(20)
      return NextResponse.json(items)
    }

    return NextResponse.json(await db.select().from(inventoryItems).orderBy(desc(inventoryItems.updatedAt)))
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
    if (!Number.isInteger(id) || !Number.isInteger(code) || !name || !category || !Number.isFinite(price) || price < 0) return NextResponse.json({ error: 'Enter valid item details.' }, { status: 400 })
    const [item] = await db.update(inventoryItems).set({ code, name, category, price: price.toFixed(2), updatedAt: new Date() }).where(eq(inventoryItems.id, id)).returning()
    if (!item) return NextResponse.json({ error: 'Catalogue item not found.' }, { status: 404 })
    return NextResponse.json(item)
  } catch (error) {
    console.error('[v0] Failed to update catalogue item:', error)
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: `Code ${Number(body.code)} is already used by another catalogue item.` }, { status: 409 })
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

    if (!Number.isInteger(code) || !name || !category || !Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: 'Enter a valid code, name, category, and price.' }, { status: 400 })
    }

    const [item] = await db.insert(inventoryItems).values({ code, name, category, price: price.toFixed(2) }).returning()
    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error('[v0] Failed to add catalogue item:', error)
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: `Code ${Number(body.code)} is already in use. Choose a different code.` }, { status: 409 })
    }
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not save the catalogue item.' }, { status: 500 })
  }
}
