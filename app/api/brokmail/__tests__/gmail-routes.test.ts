import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: vi.fn()
}))

vi.mock('@/lib/integrations/composio', () => ({
  createConnectedAccountLink: vi.fn(),
  executeComposioTool: vi.fn(),
  isComposioConfigured: vi.fn(),
  isComposioConnectMode: vi.fn(),
  listConnectedAccounts: vi.fn()
}))

import { getCurrentUser } from '@/lib/auth/get-current-user'
import {
  createConnectedAccountLink,
  executeComposioTool,
  isComposioConfigured,
  isComposioConnectMode,
  listConnectedAccounts
} from '@/lib/integrations/composio'

import { GET as getCalendarEvents } from '../gcal/events/route'
import { POST as connectGmail } from '../gmail/connect/route'
import { GET as getGmailStatus } from '../gmail/status/route'
import { GET as getGmailThreads } from '../gmail/threads/route'

describe('BrokMail Gmail routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.COMPOSIO_GMAIL_TOOLKIT_SLUGS
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

  it('requires Composio instead of browser Gmail OAuth when Composio is missing', async () => {
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
    expect(body.message).toContain('Composio is not configured')
    expect(body.message).toContain('platform Google OAuth is disabled')
  })

  it('does not return Google OAuth even when legacy env flag is set', async () => {
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

    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      provider: 'unavailable',
      connectionUrl: null,
      redirectUrl: 'https://brok.test/brokmail?gmail=connected'
    })
    expect(body.message).toContain('Composio is not configured')
    delete process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED
  })

  it('loads live Calendar events through a connected Composio account', async () => {
    vi.mocked(listConnectedAccounts).mockResolvedValue([
      {
        id: 'acct_calendar',
        status: 'active',
        toolkit_slug: 'googlecalendar'
      }
    ] as any)
    vi.mocked(executeComposioTool).mockResolvedValue({
      events: [
        {
          id: 'event_123',
          summary: 'Candidate Interview',
          start: { dateTime: '2026-05-14T22:00:00.000Z' },
          end: { dateTime: '2026-05-14T22:30:00.000Z' },
          htmlLink: 'https://calendar.google.com/event?eid=event_123'
        }
      ]
    } as any)

    const response = await getCalendarEvents()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      provider: 'composio',
      connectedAccountId: 'acct_calendar',
      toolSlug: 'GOOGLECALENDAR_LIST_EVENTS',
      events: [
        {
          id: 'event_123',
          summary: 'Candidate Interview',
          startAt: '2026-05-14T22:00:00.000Z',
          endAt: '2026-05-14T22:30:00.000Z'
        }
      ]
    })
    expect(executeComposioTool).toHaveBeenCalledWith(
      expect.objectContaining({
        toolSlug: 'GOOGLECALENDAR_LIST_EVENTS',
        userId: 'user_123',
        connectedAccountId: 'acct_calendar'
      })
    )
  })

  it('does not mask unavailable Calendar list tools as an empty success', async () => {
    vi.mocked(listConnectedAccounts).mockResolvedValue([
      {
        id: 'acct_calendar',
        status: 'active',
        toolkit_slug: 'googlecalendar'
      }
    ] as any)
    vi.mocked(executeComposioTool).mockRejectedValue(
      new Error('Tool not found')
    )

    const response = await getCalendarEvents()
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body.error).toContain('Could not list Google Calendar events')
    expect(body.attemptedTools).toEqual([
      'GOOGLECALENDAR_LIST_EVENTS',
      'GOOGLE_CALENDAR_LIST_EVENTS'
    ])
    expect(executeComposioTool).toHaveBeenCalledTimes(2)
  })

  it('summarizes raw Gmail Composio tool failures before returning them', async () => {
    vi.mocked(listConnectedAccounts).mockResolvedValue([
      {
        id: 'acct_gmail',
        status: 'active',
        toolkit_slug: 'gmail'
      }
    ] as any)
    vi.mocked(executeComposioTool).mockRejectedValue(
      new Error(
        'Composio request failed (404): {"message":"Tool GMAIL_LIST_MESSAGES not found","request_id":"req_123"}'
      )
    )

    const response = await getGmailThreads()
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body.error).toContain('Could not load Gmail through Composio')
    expect(body.error).toContain(
      'Gmail is connected, but Composio mail sync is missing the right Gmail tool.'
    )
    expect(body.error).not.toContain('request_id')
    expect(body.error).not.toContain('{')
    expect(body.attemptedTools).toEqual([
      'GMAIL_FETCH_EMAILS',
      'GMAIL_LIST_MESSAGES',
      'GMAIL_LIST_THREADS'
    ])
  })
})
