// Shapes shared between the app shell and its sections.
// These mirror the JSON returned by the API routes.

export type Item = {
  id: number
  code: number
  barcode: string | null
  name: string
  category: string
  price: string
  /** Image bytes are never placed in catalogue JSON; this flags the image endpoint. */
  image: boolean
  imageVersion: string
}

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
  publicToken: string | null
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

export type MonthlyReport = {
  month: string
  from: string
  to: string
  currentBusinessDay: string
  total: number
  count: number
  average: number
  bestDay: DailyRow
  days: DailyRow[]
}

export type Shop = {
  name: string
  address: string | null
  phone: string | null
  email: string | null
  gstin: string | null
}

export type BrandAssets = {
  logo: boolean
  favicon: boolean
  avatar: boolean
  updatedAt: string | null
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
