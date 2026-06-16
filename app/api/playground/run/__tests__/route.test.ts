import { NextRequest } from 'next/server'

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockGetCurrentUser, mockGetOrCreatePlaygroundSessionKey } = vi.hoisted(
  () => ({
    mockGetCurrentUser: vi.fn(),
    mockGetOrCreatePlaygroundSessionKey: vi.fn()
  })
)

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: mockGetCurrentUser
}))

vi.mock('@/lib/brok/playground-session-key', () => ({
  getOrCreatePlaygroundSessionKey: mockGetOrCreatePlaygroundSessionKey
}))

describe('/api/playground/run', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    mockGetCurrentUser.mockReset()
    mockGetOrCreatePlaygroundSessionKey.mockReset()
  })

  it('rejects invalid manual API keys before proxying', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { POST } = await import('../route')

    const response = await POST(
      new NextRequest('http://localhost/api/playground/run', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'chat',
          apiKey: 'not-a-key',
          payload: { model: 'brok-code', messages: [] }
        })
      })
    )

    expect(response.status).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'invalid_api_key' }
    })
  })

  it('uses a server-side account session key when no manual key is provided', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({ id: 'user_playground' })
    mockGetOrCreatePlaygroundSessionKey.mockResolvedValueOnce({
      rawKey: 'brok_sk_test_account_session',
      keyPrefix: 'brok_sk_test_acc',
      expiresAt: new Date(),
      workspace: { id: 'workspace_1' }
    })
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    const { POST } = await import('../route')

    const response = await POST(
      new NextRequest('http://localhost/api/playground/run', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'chat',
          payload: {
            model: 'brok-code',
            messages: [{ role: 'user', content: 'hi' }]
          }
        })
      })
    )

    expect(response.status).toBe(200)
    expect(mockGetOrCreatePlaygroundSessionKey).toHaveBeenCalledWith(
      'user_playground'
    )
    const [, init] = fetchSpy.mock.calls[0]!
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer brok_sk_test_account_session'
    )
  })

  it('forwards chat requests to the server-side v1 route with the API key header', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('data: [DONE]\n\n', {
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'x-request-id': 'req_proxy_test'
        }
      })
    )
    const { POST } = await import('../route')

    const response = await POST(
      new NextRequest('http://localhost/api/playground/run', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'chat',
          apiKey: 'brok_sk_test_proxy',
          payload: {
            model: 'brok-code',
            messages: [{ role: 'user', content: 'hi' }],
            stream: true
          }
        })
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(response.headers.get('x-request-id')).toBe('req_proxy_test')
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toBe('http://localhost/api/v1/chat/completions')
    expect(init).toMatchObject({
      method: 'POST',
      cache: 'no-store'
    })
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer brok_sk_test_proxy'
    )
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'brok-code',
      stream: true
    })
  })

  it('forwards search requests to the search completions route', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    const { POST } = await import('../route')

    await POST(
      new NextRequest('http://localhost/api/playground/run', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'search',
          apiKey: 'brok_sk_test_proxy',
          payload: {
            model: 'brok-search',
            query: 'latest api docs',
            stream: false
          }
        })
      })
    )

    const [url] = fetchSpy.mock.calls[0]!
    expect(String(url)).toBe('http://localhost/api/v1/search/completions')
  })
})
