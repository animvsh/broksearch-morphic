import { describe, expect, it, vi } from 'vitest'

import { createSimpleChatStreamResponse } from '@/lib/streaming/create-simple-chat-stream-response'

const createChatWithFirstMessage = vi.fn()
const upsertMessage = vi.fn()
const createChat = vi.fn()

vi.mock('@/lib/actions/chat', () => ({
  createChat,
  createChatWithFirstMessage,
  upsertMessage
}))

vi.mock('@/lib/db/schema', () => ({
  generateId: vi.fn(() => 'generated-id')
}))

describe('createSimpleChatStreamResponse', () => {
  it('falls back to message upsert when a query-backed new chat already exists', async () => {
    createChatWithFirstMessage.mockRejectedValueOnce(
      Object.assign(
        new Error('duplicate key value violates unique constraint'),
        {
          cause: { code: '23505' }
        }
      )
    )
    upsertMessage.mockResolvedValue({})

    const response = createSimpleChatStreamResponse({
      chatId: 'chat-1',
      isNewChat: true,
      message: {
        id: 'user-message-1',
        role: 'user',
        parts: [{ type: 'text', text: 'jo' }]
      },
      modelId: 'gpt-4o-mini',
      searchMode: 'quick',
      text: 'I need a little more to search well.',
      userId: 'user-1'
    })

    await expect(response.text()).resolves.toContain(
      'I need a little more to search well.'
    )
    await vi.waitFor(() => {
      expect(createChatWithFirstMessage).toHaveBeenCalledOnce()
      expect(upsertMessage).toHaveBeenCalledTimes(2)
    })
    expect(createChat).not.toHaveBeenCalled()
    expect(upsertMessage.mock.calls[0]?.[0]).toBe('chat-1')
    expect(upsertMessage.mock.calls[0]?.[1]).toMatchObject({
      id: 'user-message-1',
      role: 'user'
    })
    expect(upsertMessage.mock.calls[1]?.[1]).toMatchObject({
      role: 'assistant',
      parts: [{ type: 'text', text: 'I need a little more to search well.' }]
    })
  })
})
