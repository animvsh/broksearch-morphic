import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enforceBrokCodeAccountOwnership: vi.fn(),
  requireFeatureAccessForApi: vi.fn(),
  resolveBrokCodeRequestAuth: vi.fn(),
  startBrokBuild: vi.fn()
}))

vi.mock('@/lib/auth/app-access', () => ({
  requireFeatureAccessForApi: mocks.requireFeatureAccessForApi
}))

vi.mock('@/lib/actions/build', () => ({
  startBrokBuild: mocks.startBrokBuild
}))

vi.mock('@/lib/brokcode/account-guard', () => ({
  enforceBrokCodeAccountOwnership: mocks.enforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth: mocks.resolveBrokCodeRequestAuth
}))

import { POST } from './route'

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/build/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

describe('Brok Build stream route', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireFeatureAccessForApi.mockResolvedValue({
      ok: true,
      user: { id: 'user-1' }
    })
    mocks.resolveBrokCodeRequestAuth.mockResolvedValue({
      authResult: {
        success: true,
        workspace: { id: 'workspace-1' },
        apiKey: { userId: 'user-1' }
      }
    })
    mocks.enforceBrokCodeAccountOwnership.mockResolvedValue(null)
    mocks.startBrokBuild.mockImplementation(async ({ emit }) => {
      emit({ kind: 'done', message: 'ok' })
    })
  })

  test('denies builder streaming without BrokCode feature access', async () => {
    mocks.requireFeatureAccessForApi.mockResolvedValue({
      ok: false,
      response: Response.json(
        { error: 'Feature access denied', feature: 'brokcode' },
        { status: 403 }
      )
    })

    const response = await POST(request({ prompt: 'Ship a CRM' }))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toMatchObject({
      error: 'Feature access denied',
      feature: 'brokcode'
    })
    expect(mocks.startBrokBuild).not.toHaveBeenCalled()
  })

  test('starts builder streaming for accounts with BrokCode access', async () => {
    const response = await POST(request({ prompt: 'Ship a CRM' }))
    await response.text()

    expect(mocks.requireFeatureAccessForApi).toHaveBeenCalledWith('brokcode')
    expect(mocks.startBrokBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Ship a CRM',
        brokCodeProject: expect.objectContaining({
          workspaceId: 'workspace-1',
          userId: 'user-1',
          requireBrokCodeExecution: false
        })
      })
    )
  })

  test('requires BrokCode execution by default in cloud deployment', async () => {
    vi.stubEnv('BROK_CLOUD_DEPLOYMENT', 'true')

    const response = await POST(
      request({
        prompt: 'Ship a CRM',
        require_brokcode_execution: false
      })
    )
    await response.text()

    expect(mocks.startBrokBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        brokCodeProject: expect.objectContaining({
          requireBrokCodeExecution: true
        })
      })
    )
  })

  test('does not continue as a scaffold when BrokCode account ownership fails', async () => {
    mocks.enforceBrokCodeAccountOwnership.mockResolvedValue(
      Response.json(
        {
          error: {
            type: 'authentication_error',
            code: 'brok_account_mismatch'
          }
        },
        { status: 403 }
      )
    )

    const response = await POST(request({ prompt: 'Ship a CRM' }))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toMatchObject({
      code: 'brok_account_mismatch'
    })
    expect(mocks.startBrokBuild).not.toHaveBeenCalled()
  })

  test('requires BrokCode project auth before streaming in cloud deployment', async () => {
    vi.stubEnv('BROK_CLOUD_DEPLOYMENT', 'true')
    mocks.resolveBrokCodeRequestAuth.mockResolvedValue({
      authResult: {
        success: false,
        error: 'missing_authorization',
        status: 401
      }
    })

    const response = await POST(request({ prompt: 'Ship a CRM' }))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toMatchObject({
      type: 'authentication_error',
      code: 'missing_authorization'
    })
    expect(mocks.startBrokBuild).not.toHaveBeenCalled()
  })
})
