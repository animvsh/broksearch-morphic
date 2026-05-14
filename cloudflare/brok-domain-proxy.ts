const UPSTREAM_ORIGIN = 'https://brok-production.up.railway.app'

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
