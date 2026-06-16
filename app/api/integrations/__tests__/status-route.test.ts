import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/app-access', () => ({
  requireFeatureAccessForApi: vi.fn()
}))

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: vi.fn()
}))

vi.mock('@/lib/integrations/composio', () => ({
  canExecuteComposioTools: vi.fn(),
  isComposioConfigured: vi.fn(),
  isComposioConnectMode: vi.fn(),
  listAuthConfigs: vi.fn(),
  listConnectedAccounts: vi.fn()
}))

import { requireFeatureAccessForApi } from '@/lib/auth/app-access'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import {
  canExecuteComposioTools,
  isComposioConfigured,
  isComposioConnectMode,
  listAuthConfigs,
  listConnectedAccounts
} from '@/lib/integrations/composio'

import { GET as getIntegrationStatus } from '../[toolkit]/status/route'

function statusRequest() {
  return new Request('https://brok.test/api/integrations/gmail/status')
}

describe('generic integration status route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireFeatureAccessForApi).mockResolvedValue({
      ok: true
    } as any)
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'user_123' } as any)
    vi.mocked(isComposioConfigured).mockReturnValue(true)
    vi.mocked(isComposioConnectMode).mockReturnValue(true)
    vi.mocked(listAuthConfigs).mockResolvedValue([
      { id: 'auth_123', toolkit_slug: 'gmail', appName: 'Gmail' }
    ] as any)
    vi.mocked(listConnectedAccounts).mockResolvedValue([
      { id: 'acct_123', status: 'active', toolkit_slug: 'gmail' }
    ] as any)
  })

  it('does not mark connected accounts execution-ready without a backend key', async () => {
    vi.mocked(canExecuteComposioTools).mockReturnValue(false)

    const response = await getIntegrationStatus(statusRequest() as any, {
      params: Promise.resolve({ toolkit: 'gmail' })
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      configured: true,
      connected: false,
      accountConnected: true,
      executionReady: false,
      status: 'ready',
      toolkit: 'gmail',
      provider: 'composio-connect',
      authConfigCount: 1,
      connectedCount: 1
    })
    expect(body.message).toContain('backend COMPOSIO_API_KEY')
  })

  it('marks accounts connected only when Composio tools can execute', async () => {
    vi.mocked(isComposioConnectMode).mockReturnValue(false)
    vi.mocked(canExecuteComposioTools).mockReturnValue(true)

    const response = await getIntegrationStatus(statusRequest() as any, {
      params: Promise.resolve({ toolkit: 'gmail' })
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      connected: true,
      accountConnected: true,
      executionReady: true,
      status: 'connected',
      provider: 'composio'
    })
    expect(body.message).toContain('ready for agent actions')
  })
})
