import { notFound } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { billingTransactions, invoiceItems } from '@/lib/db/schema'
import { getShopDetails } from '@/lib/shop'
import PrintInvoiceButton from '@/components/print-invoice-button'

export const dynamic = 'force-dynamic'

const rupees = (value: string | number) =>
  `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** A customer receipt reached through the unguessable token embedded in the invoice QR code. */
export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token || token.length > 80) notFound()

  const [invoice] = await db.select().from(billingTransactions).where(eq(billingTransactions.publicToken, token))
  if (!invoice) notFound()

  const lines = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceNumber, invoice.invoiceNumber)).orderBy(asc(invoiceItems.id))
  const shop = await getShopDetails()
  const subtotal = lines.reduce((sum, line) => sum + Number(line.lineTotal), 0)
  const discount = Number(invoice.discount || 0)

  return (
    <main className="invoice-print-root dashboard-canvas min-h-screen px-4 py-10 text-foreground sm:py-14">
      <article className="invoice-print-sheet business-invoice mx-auto w-full max-w-xl rounded-3xl border-hairline bg-card p-6 sm:p-8">
        <p className="text-center text-xs font-medium tracking-[0.24em] text-gold-deep uppercase">Invoice receipt</p>
        <h1 className="mt-2 text-center text-xl font-semibold tracking-tight">{shop.name.toUpperCase()}</h1>
        {(shop.address || shop.phone || shop.gstin) && (
          <p className="mt-2 text-center text-xs text-muted-foreground">{[shop.address, shop.phone, shop.gstin ? `GSTIN: ${shop.gstin}` : null].filter(Boolean).join(' · ')}</p>
        )}
        <div className="mt-6 grid gap-2 border-y border-hairline py-4 text-sm sm:grid-cols-2">
          <p><span className="text-muted-foreground">Invoice:</span> <span className="font-medium">{invoice.invoiceNumber}</span></p>
          <p className="sm:text-right"><span className="text-muted-foreground">Date:</span> <span className="font-medium">{invoice.businessDay}</span></p>
          <p><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{invoice.customerName || 'Walk-in'}</span></p>
          <p className="sm:text-right"><span className="text-muted-foreground">Payment:</span> <span className="font-medium">{invoice.paymentStatus}</span></p>
        </div>

        <table className="mt-5 w-full text-left text-sm">
          <thead className="border-b border-hairline text-xs text-muted-foreground">
            <tr><th className="pb-2 font-medium">Item</th><th className="pb-2 text-center font-medium">Qty</th><th className="pb-2 text-right font-medium">Amount</th></tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-hairline">
                <td className="py-3"><p className="font-medium">{line.itemName}</p><p className="text-xs text-muted-foreground">{line.category}</p></td>
                <td className="py-3 text-center">{line.quantity}</td>
                <td className="py-3 text-right font-medium">{rupees(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto mt-5 max-w-xs space-y-1 text-sm">
          <p className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{rupees(subtotal)}</span></p>
          {discount > 0 && <p className="flex justify-between text-muted-foreground"><span>Discount</span><span>− {rupees(discount)}</span></p>}
          <p className="flex justify-between border-t border-hairline pt-2 text-base font-semibold"><span>Total</span><span>{rupees(invoice.totalAmount)}</span></p>
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground">Thank you for your business.</p>
        <div className="mt-6 print:hidden">
          <PrintInvoiceButton className="mx-auto" />
        </div>
      </article>
    </main>
  )
}
