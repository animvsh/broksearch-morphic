import { NextRequest } from 'next/server'

const APP_URL_ENV_KEYS = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_BASE_URL',
  'NEXT_PUBLIC_SITE_URL',
  'BASE_URL',
  'APP_URL'
]

function normalizeOrigin(value: string | undefined | null) {
  if (!value?.trim()) return null

  try {
    const withProtocol = /^https?:\/\//i.test(value)
      ? value
      : `https://${value}`
    return new URL(withProtocol).origin
  } catch {
    return null
  }
}

export function resolveBrokMailCallbackUrl(
  request: NextRequest,
  search: string
) {
  const configuredOrigin = APP_URL_ENV_KEYS.map(key =>
    normalizeOrigin(process.env[key])
  ).find(Boolean)

  const requestOrigin = (() => {
    try {
      return request.nextUrl?.origin ?? new URL(request.url).origin
    } catch {
      return 'http://localhost:3000'
    }
  })()

  const origin =
    configuredOrigin ??
    (process.env.NODE_ENV === 'production' ? 'https://brok.fyi' : requestOrigin)

  return `${origin}/brokmail${search}`
}
