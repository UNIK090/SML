import OrderTracker from '@/components/store/order-tracker'

// The customer's own tracking link: /order/SML-XXXX?t=<secret token>.
//
// The token is not validated here — the API is the authority — but sending the
// page through with it lets the tracker fetch immediately instead of showing a
// form asking the customer to re-type the order number.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const [{ orderNumber }, { t }] = await Promise.all([params, searchParams])
  return <OrderTracker orderNumber={orderNumber} token={t ?? ''} />
}
