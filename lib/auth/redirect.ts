const FALLBACK_NEXT_PATH = '/'
const SAFE_BASE_URL = 'https://brok.local'

export function resolveSafeNextPath(
  value: string | null | undefined,
  fallback = FALLBACK_NEXT_PATH
) {
  const fallbackPath = normalizeFallbackPath(fallback)

  if (!value) {
    return fallbackPath
  }

  const trimmedValue = value.trim()
  if (
    !trimmedValue.startsWith('/') ||
    trimmedValue.startsWith('//') ||
    trimmedValue.startsWith('/\\')
  ) {
    return fallbackPath
  }

  try {
    const resolved = new URL(trimmedValue, SAFE_BASE_URL)
    if (resolved.origin !== SAFE_BASE_URL) {
      return fallbackPath
    }

    return `${resolved.pathname}${resolved.search}${resolved.hash}`
  } catch {
    return fallbackPath
  }
}

export function buildAuthErrorPath(message: string) {
  const params = new URLSearchParams({ error: message })
  return `/auth/error?${params.toString()}`
}

function normalizeFallbackPath(fallback: string) {
  if (!fallback.startsWith('/') || fallback.startsWith('//')) {
    return FALLBACK_NEXT_PATH
  }

  return fallback
}
