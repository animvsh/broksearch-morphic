import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AuthResult } from '@/lib/brok/auth'

import {
  enforceBrokCodeAccountOwnership,
  getBrokCodeBrowserSessionAuth
} from '../account-guard'

const mocks = vi.hoisted(() => {
  const getCurrentUserMock = vi.fn().mockResolvedValue(null)
  const isAnonymousAuthModeMock = vi.fn(() => false)
  const selectLimitMock = vi.fn()
  const returningMock = vi.fn()
  const insertValuesMock = vi.fn(() => ({ returning: returningMock }))
  const insertMock = vi.fn(() => ({ values: insertValuesMock }))
  const orderByMock = vi.fn(() => ({ limit: selectLimitMock }))
  const whereMock = vi.fn(() => ({ orderBy: orderByMock }))
  const fromMock = vi.fn(() => ({ where: whereMock }))
  const selectMock = vi.fn(() => ({ from: fromMock }))

  return {
    getCurrentUserMock,
    isAnonymousAuthModeMock,
    selectLimitMock,
    returningMock,
    insertMock,
    selectMock
  }
})

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: mocks.getCurrentUserMock,
  isAnonymousAuthMode: mocks.isAnonymousAuthModeMock
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.selectMock,
    insert: mocks.insertMock
  }
}))

const fallbackAuthResult = {
  success: true,
  apiKey: {
    id: '00000000-0000-0000-0000-000000000001',
    userId: 'anonymous-user'
  },
  workspace: {
    id: '00000000-0000-0000-0000-000000000000'
  }
} as Extract<AuthResult, { success: true }>

describe('enforceBrokCodeAccountOwnership', () => {
  afterEach(() => {
    delete process.env.BROKCODE_ALLOW_LOCAL_AUTH_FALLBACK
    vi.clearAllMocks()
    mocks.getCurrentUserMock.mockResolvedValue(null)
    mocks.isAnonymousAuthModeMock.mockReturnValue(false)
    mocks.selectLimitMock.mockReset()
    mocks.returningMock.mockReset()
  })

  it('rejects local fallback API keys by default', async () => {
    const response = await enforceBrokCodeAccountOwnership(fallbackAuthResult)

    expect(response?.status).toBe(403)
    await expect(response?.json()).resolves.toMatchObject({
      error: {
        code: 'brokcode_real_account_required'
      }
    })
  })

  it('allows local fallback API keys only when explicitly enabled', async () => {
    process.env.BROKCODE_ALLOW_LOCAL_AUTH_FALLBACK = 'true'

    await expect(
      enforceBrokCodeAccountOwnership(fallbackAuthResult)
    ).resolves.toBeNull()
  })
})

describe('getBrokCodeBrowserSessionAuth', () => {
  afterEach(() => {
    delete process.env.BROK_CLOUD_DEPLOYMENT
    delete process.env.BROKCODE_ALLOW_LOCAL_BROWSER_SESSION_FALLBACK
    vi.unstubAllEnvs()
    vi.clearAllMocks()
    mocks.getCurrentUserMock.mockResolvedValue(null)
    mocks.isAnonymousAuthModeMock.mockReturnValue(false)
    mocks.selectLimitMock.mockReset()
    mocks.returningMock.mockReset()
  })

  it('returns null when the browser user is not signed in', async () => {
    await expect(getBrokCodeBrowserSessionAuth()).resolves.toBeNull()
  })

  it('creates a signed-in browser session without exposing an API key', async () => {
    const workspace = {
      id: 'workspace-1',
      name: 'Personal Workspace',
      ownerUserId: 'user-1',
      plan: 'free',
      status: 'active',
      monthlyBudgetCents: 0,
      createdAt: new Date('2026-05-14T00:00:00.000Z')
    }

    mocks.getCurrentUserMock.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com'
    })
    mocks.selectLimitMock.mockResolvedValue([])
    mocks.returningMock.mockResolvedValue([workspace])

    const auth = await getBrokCodeBrowserSessionAuth()

    expect(auth).toMatchObject({
      success: true,
      isBrowserSession: true,
      apiKey: {
        id: '00000000-0000-0000-0000-000000000002',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        keyPrefix: 'browser_session',
        scopes: expect.arrayContaining(['code:write'])
      },
      workspace: {
        id: 'workspace-1'
      }
    })
    expect(mocks.insertMock).toHaveBeenCalled()
  })

  it('uses a local browser workspace when dev database storage is unavailable', async () => {
    mocks.getCurrentUserMock.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com'
    })
    mocks.selectLimitMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'))

    const auth = await getBrokCodeBrowserSessionAuth()

    expect(auth).toMatchObject({
      success: true,
      isBrowserSession: true,
      apiKey: {
        userId: 'user-1',
        workspaceId: '00000000-0000-0000-0000-000000000003'
      },
      workspace: {
        id: '00000000-0000-0000-0000-000000000003',
        status: 'active'
      }
    })
  })

  it('uses a local browser workspace without probing the database in file storage mode', async () => {
    vi.stubEnv('BROKCODE_PROJECT_STORAGE', 'file')
    mocks.getCurrentUserMock.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com'
    })

    const auth = await getBrokCodeBrowserSessionAuth()

    expect(auth).toMatchObject({
      success: true,
      isBrowserSession: true,
      apiKey: {
        userId: 'user-1',
        workspaceId: '00000000-0000-0000-0000-000000000003'
      },
      workspace: {
        id: '00000000-0000-0000-0000-000000000003'
      }
    })
    expect(mocks.selectMock).not.toHaveBeenCalled()
    expect(mocks.insertMock).not.toHaveBeenCalled()
  })

  it('uses a local browser workspace for local anonymous production smoke runs', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    mocks.isAnonymousAuthModeMock.mockReturnValue(true)
    mocks.getCurrentUserMock.mockResolvedValue({
      id: 'user-1',
      email: 'anonymous@local.brok'
    })
    mocks.selectLimitMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'))

    const auth = await getBrokCodeBrowserSessionAuth()

    expect(auth).toMatchObject({
      success: true,
      isBrowserSession: true,
      workspace: {
        id: '00000000-0000-0000-0000-000000000003'
      }
    })
  })

  it('does not synthesize a browser workspace in cloud deployments', async () => {
    process.env.BROK_CLOUD_DEPLOYMENT = 'true'
    mocks.getCurrentUserMock.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com'
    })
    mocks.selectLimitMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'))

    await expect(getBrokCodeBrowserSessionAuth()).resolves.toBeNull()
  })
})
