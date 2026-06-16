import { describe, expect, it } from 'vitest'

import { POST } from '../route'

function makeRequest(body: unknown, contentType = 'application/json') {
  return new Request('https://broksearch.vercel.app/api/advanced-search', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  })
}

describe('POST /api/advanced-search', () => {
  it('returns 400 for invalid JSON payloads', async () => {
    const response = await POST(makeRequest('{bad json}'))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body).toMatchObject({ message: 'Invalid JSON payload' })
  })

  it('returns 400 when query is missing', async () => {
    const response = await POST(makeRequest({ maxResults: 3 }))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body).toMatchObject({ message: 'Missing required field: query' })
  })
})
