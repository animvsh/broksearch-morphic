import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: vi.fn()
}))

vi.mock('@/lib/integrations/composio', () => ({
  createConnectedAccountLink: vi.fn(),
  isComposioConfigured: vi.fn(),
  isComposioConnectMode: vi.fn(),
  listConnectedAccounts: vi.fn()
}))

import { getCurrentUser } from '@/lib/auth/get-current-user'
import {
  createConnectedAccountLink,
  isComposioConfigured,
  isComposioConnectMode,
  listConnectedAccounts
} from '@/lib/integrations/composio'

import { POST as connectGmail } from '../gmail/connect/route'
import { GET as getGmailStatus } from '../gmail/status/route'

describe('BrokMail Gmail routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.COMPOSIO_GMAIL_TOOLKIT_SLUGS
    delete process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED
    vi.mocked(isComposioConfigured).mockReturnValue(true)
    vi.mocked(isComposioConnectMode).mockReturnValue(false)
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'user_123'
    } as any)
  })

  it('creates Gmail links with the dedicated gmail toolkit before googlesuper', async () => {
    vi.mocked(createConnectedAccountLink).mockImplementation(
      async ({ toolkitSlug }) => ({
        raw: {},
        url:
          toolkitSlug === 'gmail'
            ? 'https://connect.example.com/gmail'
            : undefined
      })
    )

    const request = new Request(
      'https://brok.test/api/brokmail/gmail/connect',
      {
        method: 'POST',
        headers: {
          host: 'brok.test',
          'x-forwarded-proto': 'https'
        }
      }
    )

    const response = await connectGmail(request as any)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      provider: 'composio',
      toolkit: 'gmail',
      connectionUrl: 'https://connect.example.com/gmail'
    })
    expect(createConnectedAccountLink).toHaveBeenCalledTimes(1)
    expect(createConnectedAccountLink).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        toolkitSlug: 'gmail',
        redirectUrl: 'https://brok.test/brokmail?gmail=connected',
        userId: 'user_123'
      })
    )
  })

  it('checks Gmail status with gmail before broader Google fallbacks', async () => {
    vi.mocked(listConnectedAccounts).mockImplementation(
      async (_userId, toolkit) =>
        toolkit === 'gmail'
          ? [
              {
                id: 'acct_gmail',
                status: 'active',
                toolkit_slug: 'gmail'
              }
            ]
          : []
    )

    const response = await getGmailStatus()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      configured: true,
      connected: true,
      connectedCount: 1
    })
    expect(body.accounts).toEqual([
      {
        id: 'acct_gmail',
        status: 'active',
        toolkit: 'gmail'
      }
    ])
    expect(listConnectedAccounts).toHaveBeenNthCalledWith(
      1,
      'user_123',
      'gmail',
      20
    )
    expect(listConnectedAccounts).toHaveBeenNthCalledWith(
      2,
      'user_123',
      'googlesuper',
      20
    )
  })

  it('does not advertise browser Gmail sync when Google auth is disabled', async () => {
    vi.mocked(isComposioConfigured).mockReturnValue(false)

    const request = new Request(
      'https://brok.test/api/brokmail/gmail/connect',
      {
        method: 'POST',
        headers: {
          host: 'brok.test',
          'x-forwarded-proto': 'https'
        }
      }
    )

    const response = await connectGmail(request as any)
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      provider: 'unavailable',
      connectionUrl: null,
      redirectUrl: 'https://brok.test/brokmail?gmail=connected'
    })
    expect(body.message).toContain('Browser Google sync is disabled')
  })

  it('keeps browser Gmail sync fallback when Google auth is enabled', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED = 'true'
    vi.mocked(isComposioConfigured).mockReturnValue(false)

    const request = new Request(
      'https://brok.test/api/brokmail/gmail/connect',
      {
        method: 'POST',
        headers: {
          host: 'brok.test',
          'x-forwarded-proto': 'https'
        }
      }
    )

    const response = await connectGmail(request as any)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      provider: 'google-oauth',
      connectionUrl: null,
      redirectUrl: 'https://brok.test/brokmail?gmail=connected'
    })
    expect(body.message).toContain('Use browser Gmail live sync')
  })
})
