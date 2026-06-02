import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/app-access', () => ({
  requireFeatureAccessForApi: vi.fn()
}))

vi.mock('@/lib/pi/coding-agent', () => ({
  runPiAgentPrompt: vi.fn()
}))

import { requireFeatureAccessForApi } from '@/lib/auth/app-access'
import { runPiAgentPrompt } from '@/lib/pi/coding-agent'

import { POST as runBrokMailAgent } from '../pi-agent/route'

function agentRequest(body: unknown) {
  return new Request('https://brok.test/api/brokmail/pi-agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

describe('BrokMail Pi agent route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireFeatureAccessForApi).mockResolvedValue({
      ok: true,
      user: { id: 'user_123' }
    } as any)
    vi.mocked(runPiAgentPrompt).mockResolvedValue({
      model: 'pi-test',
      provider: 'pi',
      sessionId: 'session_123',
      events: [],
      content: 'Connected context is required.'
    } as any)
  })

  it('requires a non-empty prompt before calling Pi', async () => {
    const response = await runBrokMailAgent(
      agentRequest({ prompt: '   ' }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'prompt is required.' })
    expect(runPiAgentPrompt).not.toHaveBeenCalled()
  })

  it('caps oversized prompt and context fields before sending them to Pi', async () => {
    const promptTail = 'PROMPT_TAIL_SHOULD_NOT_LEAK'
    const senderTail = 'SENDER_TAIL_SHOULD_NOT_LEAK'
    const snippetTail = 'SNIPPET_TAIL_SHOULD_NOT_LEAK'
    const messageTail = 'MESSAGE_TAIL_SHOULD_NOT_LEAK'
    const recipientTail = 'RECIPIENT_TAIL_SHOULD_NOT_LEAK'
    const eventTail = 'EVENT_TAIL_SHOULD_NOT_LEAK'

    const response = await runBrokMailAgent(
      agentRequest({
        prompt: `${'p'.repeat(2100)}${promptTail}`,
        selectedThreadId: 'thread_1',
        selectedEventId: 'event_1',
        threads: [
          {
            id: 'thread_1',
            sender: `${'s'.repeat(700)}${senderTail}`,
            senderEmail: 'sender@example.com',
            subject: 'Pricing follow-up',
            snippet: `${'n'.repeat(700)}${snippetTail}`,
            messages: [
              {
                id: 'message_1',
                from: 'sender@example.com',
                to: [`${'r'.repeat(700)}${recipientTail}`],
                sentAt: 'Today',
                body: `${'b'.repeat(4100)}${messageTail}`
              }
            ]
          }
        ],
        calendarEvents: [
          {
            id: 'event_1',
            summary: 'Planning call',
            description: `${'d'.repeat(1200)}${eventTail}`,
            startAt: '2026-06-03T17:00:00.000Z',
            endAt: '2026-06-03T17:30:00.000Z'
          }
        ]
      }) as any
    )

    expect(response.status).toBe(200)
    const agentPrompt = vi.mocked(runPiAgentPrompt).mock.calls[0]?.[0]?.prompt

    expect(agentPrompt).toContain('User command:')
    expect(agentPrompt).not.toContain(promptTail)
    expect(agentPrompt).not.toContain(senderTail)
    expect(agentPrompt).not.toContain(snippetTail)
    expect(agentPrompt).not.toContain(messageTail)
    expect(agentPrompt).not.toContain(recipientTail)
    expect(agentPrompt).not.toContain(eventTail)
    expect(runPiAgentPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'brokmail',
        noTools: 'all'
      })
    )
  })
})
