// Shapes shared between the app shell and its sections.
// These mirror the JSON returned by the API routes.

export type Item = { id: number; code: number; name: string; category: string; price: string }

export type Transaction = {
  invoiceNumber: string
  itemName: string
  totalAmount: string
  paymentStatus: string
  createdAt: string
  businessDay: string
  customerName: string | null
  customerPhone: string | null
  discount: string
  quantity: number
}

export type InvoiceLine = {
  id: number
  itemCode: number
  itemName: string
  category: string
  unitPrice: string
  quantity: number
  lineTotal: string
}

export type Invoice = Transaction & { lines: InvoiceLine[] }

export type CartLine = {
  code: number
  name: string
  category: string
  cataloguePrice: number
  unitPrice: number
  quantity: number
}

export type DailyRow = { businessDay: string; total: number; count: number }

export type Shop = {
  name: string
  address: string | null
  phone: string | null
  email: string | null
  gstin: string | null
}

export type Dashboard = {
  today: string
  todayTotal: number
  todayCount: number
  allTotal: number
  allCount: number
  rangeTotal: number
  rangeCount: number
  pendingTotal: number
  pendingCount: number
  recent: Transaction[]
  daily: DailyRow[]
}

export type SendRecord = {
  id: number
  invoiceNumber: string
  channel: string
  provider: string
  phone: string
  status: string
  response: string | null
  createdAt: string
}
