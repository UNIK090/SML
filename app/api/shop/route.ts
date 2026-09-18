import { NextResponse } from 'next/server'
import { getShopDetails } from '@/lib/shop'
import { requireAdmin } from '@/lib/db/guard'

// Shop details for the printed invoice header.
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  return NextResponse.json(await getShopDetails())
}
