import { describe, expect, it } from 'vitest'

describe('GET /api/openapi', () => {
  it('serves the Brok v1 OpenAPI document', async () => {
    const { GET } = await import('../route')

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-disposition')).toContain(
      'brok-v1.openapi.json'
    )
    expect(body.openapi).toBe('3.1.0')
    expect(body.paths).toHaveProperty('/api/v1/chat/completions')
    expect(body.paths).toHaveProperty('/api/v1/search/completions')
    expect(body.components.securitySchemes).toHaveProperty('BrokApiKey')
  })
})
