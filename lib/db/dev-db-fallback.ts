export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const errorWithCode = error as unknown as { code?: unknown }
    const code =
      typeof errorWithCode.code === 'string' ? errorWithCode.code : ''
    const cause =
      error.cause instanceof Error
        ? getErrorMessage(error.cause)
        : error.cause
          ? String(error.cause)
          : ''

    return [error.message, code, cause].filter(Boolean).join(' | ')
  }

  return String(error)
}

function isFallbackEnabled() {
  if (process.env.BROK_DEV_DB_FALLBACK === 'true') {
    return true
  }

  return !(
    process.env.BROK_CLOUD_DEPLOYMENT === 'true' ||
    process.env.NODE_ENV === 'production' ||
    process.env.BROK_DEV_DB_FALLBACK === 'false' ||
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_PROJECT_ID
  )
}

export function canUseDevDbFallback(error: unknown) {
  if (!isFallbackEnabled()) {
    return false
  }

  const message = getErrorMessage(error).toLowerCase()
  const hasRoleNotFound =
    message.includes('does not exist') && message.includes('role "')

  const fallbackFragments: string[] = [
    'relation "chats" does not exist',
    'relation "messages" does not exist',
    'relation "parts" does not exist',
    'relation "background_tasks" does not exist',
    'relation "presentations" does not exist',
    'relation "presentation_slides" does not exist',
    'relation "files" does not exist',
    'relation "usage_events" does not exist',
    'relation "api_keys" does not exist',
    'relation "workspaces" does not exist',
    'relation "workspaces"',
    'enotfound',
    'ehostunreach',
    'econnrefused',
    'etimedout',
    'connect econn',
    'getaddrinfo',
    'connection terminated',
    'unable to connect'
  ]
  if (hasRoleNotFound) {
    return true
  }

  return fallbackFragments.some(fragment => message.includes(fragment))
}
