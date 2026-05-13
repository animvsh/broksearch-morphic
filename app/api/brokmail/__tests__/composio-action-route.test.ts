import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: vi.fn()
}))

vi.mock('@/lib/integrations/composio', () => ({
  executeComposioTool: vi.fn(),
  isComposioConfigured: vi.fn(),
  listConnectedAccounts: vi.fn()
}))

import { getCurrentUser } from '@/lib/auth/get-current-user'
import {
  executeComposioTool,
  isComposioConfigured,
  listConnectedAccounts
} from '@/lib/integrations/composio'

import { POST as runBrokMailAction } from '../composio/action/route'

function actionRequest(body: unknown) {
  return new Request('https://brok.test/api/brokmail/composio/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

describe('BrokMail Composio action route', () => {
  beforeEach(() => {
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
  })

  it('rejects Google actions without an explicit approval artifact', async () => {
    const response = await runBrokMailAction(
      actionRequest({
        action: 'create_draft',
        threads: [
          {
            id: 'thread_1',
            providerThreadId: 'provider_thread_1',
            senderEmail: 'sender@example.com',
            subject: 'Pricing'
          }
        ],
        draftBody: 'Thanks, I will follow up.'
      }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toContain('explicit approval artifact')
    expect(executeComposioTool).not.toHaveBeenCalled()
  })

  it('rejects approval artifacts that do not match the requested action', async () => {
    const response = await runBrokMailAction(
      actionRequest({
        action: 'archive_threads',
        threads: [{ id: 'thread_1', providerThreadId: 'provider_thread_1' }],
        approval: {
          id: 'approval_123',
          action: 'create_draft',
          approved: true
        }
      }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toContain('does not match')
    expect(executeComposioTool).not.toHaveBeenCalled()
  })

  it('runs approved actions and includes the approval trail in the response', async () => {
    const response = await runBrokMailAction(
      actionRequest({
        action: 'create_draft',
        threads: [
          {
            id: 'thread_1',
            providerThreadId: 'provider_thread_1',
            senderEmail: 'sender@example.com',
            subject: 'Pricing'
          }
        ],
        draftBody: 'Thanks, I will follow up.',
        approval: {
          id: 'approval_123',
          action: 'create_draft',
          approved: true
        }
      }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      action: 'create_draft',
      connectedAccountId: 'acct_gmail',
      approval: {
        id: 'approval_123',
        action: 'create_draft',
        approved: true
      }
    })
    expect(executeComposioTool).toHaveBeenCalledWith(
      expect.objectContaining({
        toolSlug: 'GMAIL_CREATE_EMAIL_DRAFT',
        userId: 'user_123',
        connectedAccountId: 'acct_gmail'
      })
    )
  })
})
