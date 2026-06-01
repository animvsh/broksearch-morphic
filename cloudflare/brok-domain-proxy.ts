const DEFAULT_UPSTREAM_ORIGIN = 'https://brok-production.up.railway.app'
const UPSTREAM_ORIGIN = normalizeOrigin(process.env.BROK_UPSTREAM_ORIGIN)

function normalizeOrigin(raw: string | undefined) {
  if (!raw) return DEFAULT_UPSTREAM_ORIGIN

  const trimmed = raw.trim()
  if (!trimmed) return DEFAULT_UPSTREAM_ORIGIN

  try {
    const parsed = new URL(trimmed)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return DEFAULT_UPSTREAM_ORIGIN
    }

    return parsed.toString().replace(/\/$/, '')
  } catch {
    return DEFAULT_UPSTREAM_ORIGIN
  }
}

function proxiedRequest(request: Request) {
  const incomingUrl = new URL(request.url)
  const upstreamUrl = new URL(
    `${incomingUrl.pathname}${incomingUrl.search}`,
    UPSTREAM_ORIGIN
  )
  const headers = new Headers(request.headers)

  headers.delete('host')
  headers.set('x-forwarded-host', incomingUrl.host)
  headers.set('x-forwarded-proto', incomingUrl.protocol.replace(':', ''))

  return new Request(upstreamUrl, {
    method: request.method,
    headers,
    body:
      request.method === 'GET' || request.method === 'HEAD'
        ? null
        : request.body,
    redirect: 'manual'
  })
}

function rewriteResponseLocation(response: Response, request: Request) {
  const location = response.headers.get('location')
  if (!location) return response

  const currentUrl = new URL(request.url)
  const upstreamUrl = new URL(UPSTREAM_ORIGIN)
  const nextLocation = new URL(location, UPSTREAM_ORIGIN)

  if (nextLocation.host !== upstreamUrl.host) return response

  const headers = new Headers(response.headers)
  headers.set(
    'location',
    `${currentUrl.origin}${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`
  )

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

const worker = {
  async fetch(request: Request): Promise<Response> {
    const response = await fetch(proxiedRequest(request))
    return rewriteResponseLocation(response, request)
  }
}

export default worker
