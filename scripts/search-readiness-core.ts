export type ReadinessStatus = 'PASS' | 'FAIL' | 'SKIP'

export type SseEvent = {
  event: string
  data: unknown
  raw: string
}

export type SearchSessionQuality = {
  answer: string
  sourceEvents: SseEvent[]
  followUpItems: unknown[]
  latencyMs: number
}

export function normalizeOrigin(value: string) {
  return value.trim().replace(/\/+$/, '')
}

export function isLocalOrigin(value: string) {
  try {
    const url = new URL(value)
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

export function parseSseEvents(stream: string): SseEvent[] {
  return stream
    .split(/\n\n+/)
    .map(frame => frame.trim())
    .filter(Boolean)
    .map(frame => {
      const event =
        frame
          .split('\n')
          .find(line => line.startsWith('event:'))
          ?.slice('event:'.length)
          .trim() || 'message'
      const dataText = frame
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice('data:'.length).trim())
        .join('\n')
      let data: unknown = dataText
      if (dataText && dataText !== '[DONE]') {
        try {
          data = JSON.parse(dataText)
        } catch {
          data = dataText
        }
      }
      return { event, data, raw: frame }
    })
}

export function eventDataObject(event: SseEvent) {
  return event.data && typeof event.data === 'object'
    ? (event.data as Record<string, unknown>)
    : null
}

export function collectAnswer(events: SseEvent[]) {
  return events
    .filter(event => event.event === 'answer_delta')
    .map(event => {
      const data = eventDataObject(event)
      if (data) return String(data.delta ?? data.text ?? '')
      return typeof event.data === 'string' ? event.data : ''
    })
    .join('')
}

export function collectFollowUps(events: SseEvent[]) {
  const followUpEvent = [...events]
    .reverse()
    .find(event => ['follow_ups', 'follow_ups_generated'].includes(event.event))
  const data = followUpEvent ? eventDataObject(followUpEvent) : null
  const items = data?.items ?? data?.follow_ups
  return Array.isArray(items) ? items : []
}

export function sessionContractErrors(events: SseEvent[], raw: string) {
  const required = ['status', 'query_resolved', 'search_started', 'done']
  const eventNames = new Set(events.map(event => event.event))
  const errors = required
    .filter(event => !eventNames.has(event))
    .map(event => `missing ${event} event`)

  if (!raw.includes('data: [DONE]')) {
    errors.push('missing terminal [DONE] frame')
  }

  return errors
}

export function sourceEvents(events: SseEvent[]) {
  return events.filter(event =>
    ['source', 'source_found', 'source_read', 'citation'].includes(event.event)
  )
}

export function qualityErrors({
  answer,
  followUpItems,
  latencyMs,
  sourceEvents
}: SearchSessionQuality) {
  const maxLatencyMs = Number(
    process.env.BROK_SEARCH_READINESS_MAX_LATENCY_MS || 30_000
  )
  const errors: string[] = []

  if (latencyMs > maxLatencyMs) {
    errors.push(`latency ${latencyMs}ms exceeded ${maxLatencyMs}ms`)
  }
  if (answer.trim().length < 80) {
    errors.push('answer was too short to prove product quality')
  }
  if (sourceEvents.length === 0) {
    errors.push('no source/citation events were emitted')
  }
  if (followUpItems.length === 0) {
    errors.push('no follow-up suggestions were emitted')
  }

  return errors
}
