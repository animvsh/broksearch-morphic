import type { UIMessage } from 'ai'

import {
  createChat,
  createChatWithFirstMessage,
  upsertMessage
} from '@/lib/actions/chat'
import { generateId } from '@/lib/db/schema'
import type { SearchMode } from '@/lib/types/search'
import { getVisibleTextFromParts } from '@/lib/utils/message-utils'

type SimpleChatStreamConfig = {
  chatId?: string
  isNewChat?: boolean
  message: UIMessage | null
  modelId: string
  searchMode: SearchMode
  text: string
  userId?: string | null
}

const encoder = new TextEncoder()

function streamEvent(payload: unknown) {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
}

async function persistSimpleMessages({
  chatId,
  isNewChat,
  message,
  text,
  userId
}: Pick<
  SimpleChatStreamConfig,
  'chatId' | 'isNewChat' | 'message' | 'text' | 'userId'
>) {
  if (!chatId || !userId || !message) return

  const userMessage = {
    ...message,
    id: message.id || generateId()
  }

  const title = getVisibleTextFromParts(userMessage.parts) || 'Quick check'

  if (isNewChat) {
    await createChatWithFirstMessage(chatId, userMessage, userId, title)
  } else {
    try {
      await upsertMessage(chatId, userMessage, userId)
    } catch (error) {
      await createChat(chatId, title, userId)
      await upsertMessage(chatId, userMessage, userId)
    }
  }

  await upsertMessage(
    chatId,
    {
      id: generateId(),
      role: 'assistant',
      parts: [{ type: 'text', text }],
      metadata: {
        searchMode: 'quick'
      }
    },
    userId
  )
}

export function createSimpleChatStreamResponse(config: SimpleChatStreamConfig) {
  const persistPromise = persistSimpleMessages(config).catch(error => {
    console.error('Failed to persist simple chat response:', error)
  })

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        streamEvent({
          type: 'start',
          messageMetadata: {
            searchMode: config.searchMode,
            modelId: config.modelId
          }
        })
      )
      controller.enqueue(streamEvent({ type: 'start-step' }))
      controller.enqueue(streamEvent({ type: 'text-start', id: 'txt-0' }))
      controller.enqueue(
        streamEvent({ type: 'text-delta', id: 'txt-0', delta: config.text })
      )
      controller.enqueue(streamEvent({ type: 'text-end', id: 'txt-0' }))
      controller.enqueue(streamEvent({ type: 'finish-step' }))
      controller.enqueue(streamEvent({ type: 'finish', finishReason: 'stop' }))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      await persistPromise
      controller.close()
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'x-vercel-ai-ui-message-stream': 'v1'
    }
  })
}
