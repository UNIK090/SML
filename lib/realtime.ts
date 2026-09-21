// One realtime channel per process, used to push order events to every open
// admin browser without a third-party service.
//
// Why an in-process bus: the SSE route holds a long-lived response, and the
// order route needs to hand it an event. Server-sent events are a single
// long-lived HTTP response, so no message broker is required to get sub-second
// delivery. A polling fallback in the client covers multiple instances.
//
// The bus is deliberately globalThis-backed so a dev-server hot reload does not
// silently create a second bus and disconnect live listeners.

export type RealtimeMessage = { event: string; data: unknown; id?: string }

type Listener = (message: RealtimeMessage) => void

const globalKey = Symbol.for('sml.realtime.bus')

type Bus = { listeners: Set<Listener>; lastEventId: string | null }

function bus(): Bus {
  const scope = globalThis as unknown as Record<symbol, Bus | undefined>
  scope[globalKey] ??= { listeners: new Set(), lastEventId: null }
  return scope[globalKey]!
}

/** Subscribes a stream to the channel. Returns the unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  const current = bus()
  current.listeners.add(listener)
  return () => current.listeners.delete(listener)
}

/** Remembers the newest event id so a reconnecting client can ask to resume. */
export function rememberEventId(id: string) {
  bus().lastEventId = id
}

/** The newest event id this process has published, or null for a cold start. */
export function lastEventId(): string | null {
  return bus().lastEventId
}

/**
 * Publishes to every open admin stream.
 *
 * A listener that throws (a browser that vanished mid-write) is dropped rather
 * than allowed to break the publish loop for everyone else.
 */
export function publish(message: RealtimeMessage) {
  if (message.id) rememberEventId(message.id)
  for (const listener of [...bus().listeners]) {
    try {
      listener(message)
    } catch {
      bus().listeners.delete(listener)
    }
  }
}

export function listenerCount(): number {
  return bus().listeners.size
}
