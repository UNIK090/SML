// Helpers for reporting database failures honestly.
// Drizzle wraps driver errors in a `cause` (sometimes an AggregateError), so we
// walk the chain of causes rather than trusting any single error object.

function collectErrors(error: unknown): { code?: string; message?: string }[] {
  const found: { code?: string; message?: string }[] = []
  const seen = new Set<unknown>()
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    const candidate = value as { code?: string; message?: string; errors?: unknown[]; cause?: unknown }
    found.push({ code: candidate.code, message: candidate.message })
    if (Array.isArray(candidate.errors)) candidate.errors.forEach(walk)
    if (candidate.cause) walk(candidate.cause)
  }
  walk(error)
  return found
}

/** Postgres unique-constraint violation (23505). */
export function isUniqueViolation(error: unknown): boolean {
  return collectErrors(error).some((entry) => entry.code === '23505')
}

/** The database could not be reached at all (wrong host, no network, pool closed). */
export function isConnectionError(error: unknown): boolean {
  const connectionCodes = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH', 'ECONNRESET', 'EPIPE'])
  const connectionMessages = ['terminating connection', 'Connection terminated', 'timeout exceeded when trying to connect', 'password authentication failed']
  return collectErrors(error).some(
    (entry) =>
      (entry.code !== undefined && connectionCodes.has(entry.code)) ||
      (entry.message !== undefined && connectionMessages.some((fragment) => entry.message!.includes(fragment))),
  )
}
