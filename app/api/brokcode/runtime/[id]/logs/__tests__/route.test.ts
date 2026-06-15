import { beforeEach, describe, expect, test, vi } from 'vitest'

const {
  mockAppendBrokCodeRuntimeBrowserEvent,
  mockEnforceBrokCodeAccountOwnership,
  mockGetBrokCodeRuntimeDiagnostics,
  mockGetBrokCodeRuntimeSandboxById,
  mockResolveBrokCodeRequestAuth
} = vi.hoisted(() => ({
  mockAppendBrokCodeRuntimeBrowserEvent: vi.fn(),
  mockEnforceBrokCodeAccountOwnership: vi.fn(),
  mockGetBrokCodeRuntimeDiagnostics: vi.fn(),
  mockGetBrokCodeRuntimeSandboxById: vi.fn(),
  mockResolveBrokCodeRequestAuth: vi.fn()
}))

vi.mock('@/lib/brokcode/account-guard', () => ({
  enforceBrokCodeAccountOwnership: mockEnforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth: mockResolveBrokCodeRequestAuth
}))

vi.mock('@/lib/brokcode/runtime/process-manager', () => ({
  appendBrokCodeRuntimeBrowserEvent: mockAppendBrokCodeRuntimeBrowserEvent,
  getBrokCodeRuntimeDiagnostics: mockGetBrokCodeRuntimeDiagnostics
}))

vi.mock('@/lib/brokcode/runtime/store', () => ({
  getBrokCodeRuntimeSandboxById: mockGetBrokCodeRuntimeSandboxById
}))

import { GET, POST } from '../route'

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
  userId: 'user-owner',
  logs: []
}

function routeParams(id = 'runtime-owner') {
  return { params: Promise.resolve({ id }) }
}

function request(method: string, body?: Record<string, unknown>) {
  return new Request(
    `http://localhost/api/brokcode/runtime/runtime-owner/logs`,
    {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    }
  )
}

describe('BrokCode runtime logs route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveBrokCodeRequestAuth.mockResolvedValue({ authResult: ownerAuth })
    mockEnforceBrokCodeAccountOwnership.mockResolvedValue(null)
    mockGetBrokCodeRuntimeSandboxById.mockResolvedValue(ownerRuntime)
    mockGetBrokCodeRuntimeDiagnostics.mockReturnValue({
      status: 'healthy',
      recentLogs: []
    })
    mockAppendBrokCodeRuntimeBrowserEvent.mockResolvedValue([
      { type: 'browser_console', level: 'error' }
    ])
  })

  test('GET requires BrokCode request authentication', async () => {
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

    const response = await GET(request('GET'), routeParams())
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('missing_api_key')
    expect(mockGetBrokCodeRuntimeSandboxById).not.toHaveBeenCalled()
  })

  test('GET returns diagnostics for the runtime owner', async () => {
    const response = await GET(request('GET'), routeParams())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mockResolveBrokCodeRequestAuth).toHaveBeenCalledWith(
      expect.any(Request),
      { allowBrowserSession: true }
    )
    expect(mockGetBrokCodeRuntimeSandboxById).toHaveBeenCalledWith({
      id: 'runtime-owner'
    })
    expect(body).toMatchObject({
      diagnostics: {
        status: 'healthy'
      },
      runtime: {
        id: 'runtime-owner'
      }
    })
  })

  test('GET hides runtimes owned by another account', async () => {
    mockGetBrokCodeRuntimeSandboxById.mockResolvedValue({
      ...ownerRuntime,
      workspaceId: 'workspace-other'
    })

    const response = await GET(request('GET'), routeParams())
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe('Runtime not found')
    expect(mockGetBrokCodeRuntimeDiagnostics).not.toHaveBeenCalled()
  })

  test('POST rejects browser log writes for another account', async () => {
    mockGetBrokCodeRuntimeSandboxById.mockResolvedValue({
      ...ownerRuntime,
      userId: 'user-other'
    })

    const response = await POST(
      request('POST', { level: 'error', message: 'boom' }),
      routeParams()
    )

    expect(response.status).toBe(404)
    expect(mockAppendBrokCodeRuntimeBrowserEvent).not.toHaveBeenCalled()
  })

  test('POST accepts a browser log event from the runtime owner', async () => {
    const response = await POST(
      request('POST', { level: 'error', message: 'boom' }),
      routeParams()
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mockAppendBrokCodeRuntimeBrowserEvent).toHaveBeenCalledWith({
      runtime: ownerRuntime,
      event: {
        level: 'error',
        message: 'boom'
      }
    })
    expect(body.logs).toEqual([{ type: 'browser_console', level: 'error' }])
  })
})
