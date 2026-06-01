function getErrorMessage(error: unknown): string {
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

export function canUseUsageDashboardFallback(error: unknown) {
  if (
    process.env.BROK_CLOUD_DEPLOYMENT === 'true' ||
    process.env.NODE_ENV === 'production' ||
    process.env.BROK_DEV_DB_FALLBACK === 'false' ||
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_PROJECT_ID
  ) {
    return false
  }

  const message = getErrorMessage(error).toLowerCase()
  return [
    'relation "usage_events" does not exist',
    'relation "api_keys" does not exist',
    'relation "workspaces" does not exist',
    'usage_events',
    'api_keys',
    'workspaces',
    'enotfound',
    'ehostunreach',
    'econnrefused',
    'etimedout',
    'connect econn',
    'getaddrinfo',
    'connection terminated',
    'unable to connect'
  ].some(fragment => message.includes(fragment))
}
