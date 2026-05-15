const DEFAULT_MESSAGE = 'This integration is not available right now.'

export function summarizeBrokMailIntegrationError(
  error: unknown,
  fallback = DEFAULT_MESSAGE
) {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ''

  const message = raw.trim()
  if (!message) return fallback

  const lower = message.toLowerCase()

  if (
    lower.includes('gmail_fetch_emails') ||
    lower.includes('gmail_list_messages') ||
    lower.includes('gmail_list_threads') ||
    lower.includes('gmail')
  ) {
    return 'Gmail is connected, but Composio mail sync is missing the right Gmail tool.'
  }

  if (
    lower.includes('googlecalendar_list_events') ||
    lower.includes('google_calendar_list_events') ||
    lower.includes('googlecalendar') ||
    lower.includes('google_calendar') ||
    lower.includes('calendar')
  ) {
    return 'Calendar is connected, but Composio event sync is missing the right Calendar tool.'
  }

  if (lower.includes('tool') && lower.includes('not found')) {
    return 'The required Composio tool is not enabled for this integration.'
  }

  if (lower.includes('auth config not found')) {
    return 'The Composio auth config is not visible to this Brok environment.'
  }

  if (lower.includes('connected account')) {
    return 'The connected Google account could not be used. Reconnect it and try again.'
  }

  if (/unauthorized|forbidden|permission|scope/.test(lower)) {
    return 'Google permission was denied. Reconnect with the required Gmail and Calendar access.'
  }

  if (lower.includes('composio request failed')) return fallback

  return message
    .replace(/\s*\{[\s\S]*$/, '')
    .replace(/\s*\|[\s\S]*$/, '')
    .slice(0, 180)
}
