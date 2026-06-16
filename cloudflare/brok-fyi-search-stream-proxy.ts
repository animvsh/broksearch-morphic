const handler = {
  async fetch(request: Request): Promise<Response> {
    const incomingUrl = new URL(request.url)

    if (!incomingUrl.pathname.startsWith('/api/search/stream/')) {
      return Response.json(
        {
          error: 'not_found',
          code: 'invalid_stream_proxy_route',
          message: 'Stream proxy only handles /api/search/stream/* paths.'
        },
        {
          status: 404,
          headers: {
            'x-brok-stream-proxy': 'v1'
          }
        }
      )
    }

    const upstreamOrigin = 'https://broksearch.vercel.app'
    const targetUrl = new URL(
      `${incomingUrl.pathname}${incomingUrl.search}`,
      upstreamOrigin
    )

    const headers = new Headers(request.headers)
    headers.delete('host')

    const upstreamRequest = new Request(targetUrl, {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual'
    })

    const response = await fetch(upstreamRequest)
    const responseHeaders = new Headers(response.headers)
    responseHeaders.set('x-brok-stream-proxy', 'v1')

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    })
  }
}

export default handler
