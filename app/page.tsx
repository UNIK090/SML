import StorePage from '@/components/store-page'

// The public shop window. There is no admin session here on purpose: this is
// the page a customer sees, and the billing desk lives at /admin.
export default function Page() {
  return <StorePage />
}
