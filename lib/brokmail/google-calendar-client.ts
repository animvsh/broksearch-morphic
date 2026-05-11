export type BrokCalendarEvent = {
  id: string
  summary: string
  description: string
  location: string
  startAt: string
  endAt: string
  isAllDay: boolean
  htmlLink: string
}

type GoogleCalendarEvent = {
  id?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  start?: {
    date?: string
    dateTime?: string
  }
  end?: {
    date?: string
    dateTime?: string
  }
}

function calendarFetch<T>(accessToken: string, path: string, init?: RequestInit) {
  return fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  }).then(async response => {
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      const message =
        body?.error?.message || `Calendar request failed with ${response.status}`
      throw new Error(message)
    }
    return body as T
  })
}

function toCalendarEvent(event: GoogleCalendarEvent): BrokCalendarEvent | null {
  if (!event.id) return null

  const startAt = event.start?.dateTime || event.start?.date || ''
  const endAt = event.end?.dateTime || event.end?.date || ''
  if (!startAt) return null

  return {
    id: event.id,
    summary: event.summary?.trim() || '(untitled event)',
    description: event.description?.trim() || '',
    location: event.location?.trim() || '',
    startAt,
    endAt,
    isAllDay: Boolean(event.start?.date && !event.start?.dateTime),
    htmlLink: event.htmlLink || ''
  }
}

export async function fetchCalendarEvents(
  accessToken: string,
  maxResults: number = 25
) {
  const timeMin = new Date().toISOString()
  const query = new URLSearchParams({
    maxResults: String(Math.max(1, Math.min(50, maxResults))),
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin
  })

  const payload = await calendarFetch<{ items?: GoogleCalendarEvent[] }>(
    accessToken,
    `calendars/primary/events?${query.toString()}`
  )

  return (payload.items ?? [])
    .map(toCalendarEvent)
    .filter((event): event is BrokCalendarEvent => Boolean(event))
}

export async function createCalendarEvent({
  accessToken,
  summary,
  description,
  location,
  startAt,
  endAt
}: {
  accessToken: string
  summary: string
  description?: string
  location?: string
  startAt: Date
  endAt: Date
}) {
  const payload = await calendarFetch<GoogleCalendarEvent>(
    accessToken,
    'calendars/primary/events',
    {
      method: 'POST',
      body: JSON.stringify({
        summary,
        description: description || undefined,
        location: location || undefined,
        start: { dateTime: startAt.toISOString() },
        end: { dateTime: endAt.toISOString() }
      })
    }
  )

  const event = toCalendarEvent(payload)
  if (!event) {
    throw new Error('Calendar returned an invalid event payload.')
  }
  return event
}

export async function deleteCalendarEvent({
  accessToken,
  eventId
}: {
  accessToken: string
  eventId: string
}) {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  )

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const message =
      body?.error?.message || `Calendar delete failed with ${response.status}`
    throw new Error(message)
  }
}
