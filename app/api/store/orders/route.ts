import { placeOrderResponse, type PlaceOrderInput } from '@/lib/orders'

// Public order intake: the storefront checkout posts here.
// No session is required, which is exactly why lib/orders re-checks that every
// requested product is published before anything is written.

export async function POST(request: Request) {
  let body: PlaceOrderInput
  try {
    body = (await request.json()) as PlaceOrderInput
  } catch {
    return Response.json({ error: 'The order could not be read. Please try again.' }, { status: 400 })
  }
  return placeOrderResponse(body)
}
