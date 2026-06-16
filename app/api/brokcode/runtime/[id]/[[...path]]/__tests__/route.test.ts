import { beforeEach, describe, expect, test, vi } from 'vitest'

const {
  mockEnforceBrokCodeAccountOwnership,
  mockGetBrokCodeRuntimeProcess,
  mockGetBrokCodeRuntimeSandboxById,
  mockResolveBrokCodeRequestAuth
} = vi.hoisted(() => ({
  mockEnforceBrokCodeAccountOwnership: vi.fn(),
  mockGetBrokCodeRuntimeProcess: vi.fn(),
  mockGetBrokCodeRuntimeSandboxById: vi.fn(),
  mockResolveBrokCodeRequestAuth: vi.fn()
}))

vi.mock('@/lib/brokcode/account-guard', () => ({
  enforceBrokCodeAccountOwnership: mockEnforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth: mockResolveBrokCodeRequestAuth
}))

vi.mock('@/lib/brokcode/runtime/process-manager', () => ({
  getBrokCodeRuntimeProcess: mockGetBrokCodeRuntimeProcess
}))

vi.mock('@/lib/brokcode/runtime/store', () => ({
  getBrokCodeRuntimeSandboxById: mockGetBrokCodeRuntimeSandboxById
}))

import { GET } from '../route'

const ownerAuth = {
  success: true,
  apiKey: {
    userId: 'user-owner'
  },
  workspace: {
    id: 'workspace-owner'
  }
}

const ownerRuntime = {
  id: 'runtime-owner',
  workspaceId: 'workspace-owner',
  userId: 'user-owner'
}

function routeParams(path?: string[]) {
  return { params: Promise.resolve({ id: 'runtime-owner', path }) }
}

function request(path = '/') {
  return new Request(
    `http://localhost/api/brokcode/runtime/runtime-owner${path}`
  )
}

describe('BrokCode runtime proxy route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveBrokCodeRequestAuth.mockResolvedValue({ authResult: ownerAuth })
    mockEnforceBrokCodeAccountOwnership.mockResolvedValue(null)
    mockGetBrokCodeRuntimeSandboxById.mockResolvedValue(ownerRuntime)
    mockGetBrokCodeRuntimeProcess.mockReturnValue({
      status: 'ready',
      url: 'http://runtime.local'
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html><body>Hello</body></html>', {
          status: 200,
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'content-security-policy': "default-src 'self'",
            'x-frame-options': 'DENY',
            'content-length': '31'
          }
        })
      )
    )
  })

  test('requires BrokCode request authentication', async () => {
    mockResolveBrokCodeRequestAuth.mockResolvedValue({
      authResult: {
        success: false,
        status: 401,
        error: {
          type: 'authentication_error',
          code: 'missing_api_key',
          message: 'Missing API key.'
        }
      }
    })

    const response = await GET(request(), routeParams())
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('missing_api_key')
    expect(mockGetBrokCodeRuntimeSandboxById).not.toHaveBeenCalled()
  })

  test('hides runtimes owned by another account', async () => {
    mockGetBrokCodeRuntimeSandboxById.mockResolvedValue({
      ...ownerRuntime,
      workspaceId: 'workspace-other'
    })

    const response = await GET(request(), routeParams())
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe('Runtime not found')
    expect(mockGetBrokCodeRuntimeProcess).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  test('proxies owner requests and preserves generated security headers', async () => {
    const response = await GET(
      request('/assets/app.css?x=1'),
      routeParams(['assets', 'app.css'])
    )
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(mockResolveBrokCodeRequestAuth).toHaveBeenCalledWith(
      expect.any(Request),
      { allowBrowserSession: true }
    )
    expect(fetch).toHaveBeenCalledWith(
      new URL('http://runtime.local/assets/app.css?x=1'),
      expect.objectContaining({
        method: 'GET',
        redirect: 'manual'
      })
    )
    expect(response.headers.get('content-security-policy')).toBe(
      "default-src 'self'"
    )
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('content-length')).toBeNull()
    expect(text).toContain('Hello')
    expect(text).toContain('/api/brokcode/runtime/runtime-owner/logs')
  })

  test('returns unavailable when the owner runtime process is not ready', async () => {
    mockGetBrokCodeRuntimeProcess.mockReturnValue({
      status: 'starting',
      url: 'http://runtime.local'
    })

    const response = await GET(request(), routeParams())
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.error).toBe('Runtime preview is not ready yet.')
    expect(fetch).not.toHaveBeenCalled()
  })
})
