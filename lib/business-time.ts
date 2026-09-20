// The desk operates on India business time, not on the database server's
// timezone. This is the single source of truth for day boundaries everywhere
// in the app: a new business day begins precisely at 12:00 AM in India.

export const BUSINESS_TIME_ZONE = 'Asia/Kolkata'

function parts(value: Date) {
  const values = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const get = (type: 'year' | 'month' | 'day') => values.find((part) => part.type === type)?.value ?? ''
  return { year: get('year'), month: get('month'), day: get('day') }
}

/** YYYY-MM-DD for the shop's current business day. */
export function businessDate(value = new Date()) {
  const date = parts(value)
  return `${date.year}-${date.month}-${date.day}`
}

/** YYYY-MM for the shop's current business month. */
export function businessMonth(value = new Date()) {
  const date = parts(value)
  return `${date.year}-${date.month}`
}

export function validBusinessMonth(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

/** Inclusive ISO boundaries for a calendar month without timezone drift. */
export function monthRange(month: string) {
  if (!validBusinessMonth(month)) return null
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}`, days: lastDay }
}
