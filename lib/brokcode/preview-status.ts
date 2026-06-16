type PreviewStatusPolicyOptions = {
  allowedOrigins?: Iterable<unknown>
  allowPrivatePreview?: boolean
  nodeEnv?: string
}

const DERIVED_PREVIEW_ORIGIN_ENV_KEYS = [
  'BROKCODE_PREVIEW_URL',
  'BROKCODE_DEPLOY_PREVIEW_URL',
  'NEXT_PUBLIC_BROKCODE_PREVIEW_URL',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_BASE_URL',
  'BASE_URL',
  'RAILWAY_PUBLIC_DOMAIN',
  'RAILWAY_STATIC_URL',
  'NEXT_PUBLIC_SITE_URL'
]

function normalizeOrigin(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return null

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`
    return new URL(withProtocol).origin
  } catch {
    return null
  }
}

function isLocalPreviewHost(hostname: string) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1'
  )
}

function originVariants(value: unknown) {
  const origin = normalizeOrigin(value)
  if (!origin) return []

  const variants = new Set([origin])
  try {
    const url = new URL(origin)
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4)
      variants.add(url.origin)
    } else if (!isLocalPreviewHost(url.hostname)) {
      url.hostname = `www.${url.hostname}`
      variants.add(url.origin)
    }
  } catch {
    return [origin]
  }

  return [...variants]
}

function canCheckLocalPreviewHost(options?: PreviewStatusPolicyOptions) {
  if (typeof options?.allowPrivatePreview === 'boolean') {
    return options.allowPrivatePreview
  }
  if (process.env.BROKCODE_ALLOW_PRIVATE_PREVIEW === 'true') return true
  return (options?.nodeEnv ?? process.env.NODE_ENV) !== 'production'
}

function resolveAllowedOrigins(options?: PreviewStatusPolicyOptions) {
  const configuredOrigins = options?.allowedOrigins ?? [
    ...(process.env.BROKCODE_PREVIEW_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map(value => value.trim()),
    ...DERIVED_PREVIEW_ORIGIN_ENV_KEYS.map(key => process.env[key])
  ]

  return new Set([...configuredOrigins].flatMap(value => originVariants(value)))
}

export function isManagedBrokCodePreviewStatusUrl(
  url: URL,
  publicOrigin: string
) {
  if (url.origin !== publicOrigin) return false

  return (
    url.pathname.startsWith('/api/brokcode/previews/') ||
    url.pathname.startsWith('/api/brokcode/runtime/') ||
    url.pathname.startsWith('/brokcode/apps/')
  )
}

export function isReadyManagedBrokCodePreviewStatusUrl(
  url: URL,
  publicOrigin: string
) {
  if (url.origin !== publicOrigin) return false

  return (
    url.pathname.startsWith('/api/brokcode/previews/') ||
    url.pathname.startsWith('/api/brokcode/runtime/')
  )
}

export function isAllowedBrokCodePreviewStatusUrl(
  url: URL,
  publicOrigin: string,
  options?: PreviewStatusPolicyOptions
) {
  if (!['http:', 'https:'].includes(url.protocol)) return false
  if (isManagedBrokCodePreviewStatusUrl(url, publicOrigin)) return true
  if (url.origin === publicOrigin) return false
  if (isLocalPreviewHost(url.hostname)) {
    return canCheckLocalPreviewHost(options)
  }
  return resolveAllowedOrigins(options).has(url.origin)
}
