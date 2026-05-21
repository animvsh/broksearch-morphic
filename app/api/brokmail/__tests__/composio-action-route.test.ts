import { beforeEach, describe, expect, it, vi } from 'vitest'

import { signBrokMailApproval } from '@/lib/brokmail/action-approval'

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: vi.fn()
}))

vi.mock('@/lib/integrations/composio', () => ({
  executeComposioTool: vi.fn(),
  isComposioConfigured: vi.fn(),
  listConnectedAccounts: vi.fn()
}))

vi.mock('@/lib/brokmail/approval-consumption', () => ({
  consumeBrokMailApproval: vi.fn(),
  releaseBrokMailApproval: vi.fn()
}))

import { getCurrentUser } from '@/lib/auth/get-current-user'
import {
  consumeBrokMailApproval,
  releaseBrokMailApproval
} from '@/lib/brokmail/approval-consumption'
import {
  executeComposioTool,
  isComposioConfigured,
  listConnectedAccounts
} from '@/lib/integrations/composio'

import { POST as runBrokMailAction } from '../composio/action/route'

const draftPayload = {
  action: 'create_draft' as const,
  threads: [
    {
      id: 'thread_1',
      providerThreadId: 'provider_thread_1',
      senderEmail: 'sender@example.com',
      subject: 'Pricing'
    }
  ],
  draftBody: 'Thanks, I will follow up.',
  calendarEvent: null
}

function actionRequest(body: unknown) {
  return new Request('https://brok.test/api/brokmail/composio/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

describe('BrokMail Composio action route', () => {
  beforeEach(() => {
    delete process.env.COMPOSIO_GCAL_TOOLKIT_SLUGS
    vi.clearAllMocks()
    vi.mocked(isComposioConfigured).mockReturnValue(true)
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'user_123' } as any)
    vi.mocked(listConnectedAccounts).mockResolvedValue([
      {
        id: 'acct_gmail',
        status: 'active',
        toolkit_slug: 'gmail'
      }
    ] as any)
    vi.mocked(executeComposioTool).mockResolvedValue({ ok: true } as any)
    vi.mocked(consumeBrokMailApproval).mockResolvedValue(true)
    vi.mocked(releaseBrokMailApproval).mockResolvedValue(undefined)
  })

  it('rejects Google actions without a server-issued approval token', async () => {
    const response = await runBrokMailAction(
      actionRequest({
        ...draftPayload
      }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toContain('server-issued approval token')
    expect(executeComposioTool).not.toHaveBeenCalled()
  })

  it('rejects approval tokens that do not match the requested action', async () => {
    const approval = signBrokMailApproval({
      userId: 'user_123',
      payload: draftPayload
    })

    const response = await runBrokMailAction(
      actionRequest({
        action: 'archive_threads',
        threads: [{ id: 'thread_1', providerThreadId: 'provider_thread_1' }],
        approval
      }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toContain('does not match the requested Google action')
    expect(executeComposioTool).not.toHaveBeenCalled()
  })

  it('rejects approval tokens when the payload has been changed', async () => {
    const approval = signBrokMailApproval({
      userId: 'user_123',
      payload: draftPayload
    })

    const response = await runBrokMailAction(
      actionRequest({
        ...draftPayload,
        draftBody: 'Changed after approval.',
        approval
      }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toContain('does not match the requested action payload')
    expect(executeComposioTool).not.toHaveBeenCalled()
  })

  it('rejects replayed approval tokens before Composio execution', async () => {
    vi.mocked(consumeBrokMailApproval).mockResolvedValue(false)
    const approval = signBrokMailApproval({
      userId: 'user_123',
      payload: draftPayload
    })

    const response = await runBrokMailAction(
      actionRequest({
        ...draftPayload,
        approval
      }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toContain('already been used')
    expect(executeComposioTool).not.toHaveBeenCalled()
  })

  it('uses the same approval id for duplicate approval requests in the same TTL window', () => {
    const now = new Date('2026-05-20T03:00:00.000Z')
    const firstApproval = signBrokMailApproval({
      userId: 'user_123',
      payload: draftPayload,
      now
    })
    const duplicateApproval = signBrokMailApproval({
      userId: 'user_123',
      payload: draftPayload,
      now: new Date(now.getTime() + 1_000)
    })
    const laterApproval = signBrokMailApproval({
      userId: 'user_123',
      payload: draftPayload,
      now: new Date(now.getTime() + 5 * 60 * 1000)
    })

    expect(duplicateApproval.id).toBe(firstApproval.id)
    expect(laterApproval.id).not.toBe(firstApproval.id)
  })

  it('runs server-approved actions and includes the approval trail in the response', async () => {
    const approval = signBrokMailApproval({
      userId: 'user_123',
      payload: draftPayload
    })

    const response = await runBrokMailAction(
      actionRequest({
        ...draftPayload,
        approval
      }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      action: 'create_draft',
      connectedAccountId: 'acct_gmail',
      approval: {
        id: approval.id,
        action: 'create_draft',
        approved: true
      }
    })
    expect(executeComposioTool).toHaveBeenCalledWith(
      expect.objectContaining({
        toolSlug: 'GMAIL_CREATE_EMAIL_DRAFT',
        userId: 'user_123',
        connectedAccountId: 'acct_gmail',
        arguments: expect.objectContaining({
          body: 'Thanks, I will follow up.',
          thread_id: 'provider_thread_1',
          to: 'sender@example.com'
        })
      })
    )
  })

  it('uses configured calendar toolkit candidates for calendar writes', async () => {
    process.env.COMPOSIO_GCAL_TOOLKIT_SLUGS = 'googlecalendar'
    vi.mocked(listConnectedAccounts).mockImplementation(
      async (_userId, toolkitSlug) =>
        toolkitSlug === 'googlecalendar'
          ? ([
              {
                id: 'acct_calendar',
                status: 'active',
                toolkit_slug: 'googlecalendar'
              }
            ] as any)
          : []
    )
    const payload = {
      action: 'create_calendar_event' as const,
      threads: [],
      draftBody: undefined,
      calendarEvent: {
        summary: 'Prep call',
        startAt: '2026-06-01T15:00:00.000Z',
        endAt: '2026-06-01T15:30:00.000Z'
      }
    }
    const approval = signBrokMailApproval({
      userId: 'user_123',
      payload
    })

    const response = await runBrokMailAction(
      actionRequest({
        ...payload,
        approval
      }) as any
    )

    expect(response.status).toBe(200)
    expect(listConnectedAccounts).toHaveBeenCalledWith(
      'user_123',
      'googlecalendar',
      10
    )
    expect(executeComposioTool).toHaveBeenCalledWith(
      expect.objectContaining({
        connectedAccountId: 'acct_calendar',
        arguments: expect.objectContaining({
          calendar_id: 'primary',
          summary: 'Prep call',
          start_datetime: '2026-06-01T15:00:00.000Z'
        })
      })
    )
  })

  it('releases approval consumption when every Composio tool attempt fails', async () => {
    vi.mocked(executeComposioTool).mockRejectedValue(
      new Error('provider unavailable')
    )
    const approval = signBrokMailApproval({
      userId: 'user_123',
      payload: draftPayload
    })

    const response = await runBrokMailAction(
      actionRequest({
        ...draftPayload,
        approval
      }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body.error).toContain('provider unavailable')
    expect(consumeBrokMailApproval).toHaveBeenCalledWith({
      userId: 'user_123',
      approval
    })
    expect(releaseBrokMailApproval).toHaveBeenCalledWith({
      userId: 'user_123',
      approval
    })
  })
})
