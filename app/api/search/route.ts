import { NextRequest } from 'next/server'

import { POST as postSearchCompletion } from '@/app/api/v1/search/completions/route'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const headers = new Headers(request.headers)
  headers.set('content-type', 'application/json')
  headers.delete('content-length')

  const depth =
    body.mode === 'deep' || body.mode === 'deep_search'
      ? 'deep'
      : body.mode === 'quick' || body.mode === 'lite'
        ? 'lite'
        : body.depth || body.search_depth || 'standard'

  const forwarded = new NextRequest(
    new URL('/api/v1/search/completions', request.url),
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: body.model || 'brok-search',
        query: body.query,
        depth,
        stream: body.stream ?? true,
        recency_days: body.recency_days,
        domains: body.domains
      })
    }
  )

  return postSearchCompletion(forwarded)
}
