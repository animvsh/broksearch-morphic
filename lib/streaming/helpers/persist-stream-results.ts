import { UIMessage } from 'ai'

import { createChatWithFirstMessage, upsertMessage } from '@/lib/actions/chat'
import { updateChatTitle } from '@/lib/db/actions'
import { SearchMode } from '@/lib/types/search'
import { stripUploadedFileContext } from '@/lib/utils/message-utils'
import { perfTime } from '@/lib/utils/perf-logging'
import { retryDatabaseOperation } from '@/lib/utils/retry'
import { stripThinkingBlocks } from '@/lib/utils/strip-thinking-blocks'

const DEFAULT_CHAT_TITLE = 'Untitled'

function sanitizeMessageTextParts(message: UIMessage): UIMessage {
  const parts = message.parts?.map(part => {
    if (part.type === 'text' && typeof part.text === 'string') {
      return {
        ...part,
        text: stripUploadedFileContext(stripThinkingBlocks(part.text))
      }
    }

    return part
  })

  return parts ? { ...message, parts } : message
}

export async function persistStreamResults(
  responseMessage: UIMessage,
  chatId: string,
  userId: string,
  titlePromise?: Promise<string>,
  parentTraceId?: string,
  searchMode?: SearchMode,
  modelId?: string,
  initialSavePromise?: Promise<
    Awaited<ReturnType<typeof createChatWithFirstMessage>>
  >,
  initialUserMessage?: UIMessage
) {
  const sanitizedResponseMessage = sanitizeMessageTextParts(responseMessage)

  // Attach metadata to the response message
  sanitizedResponseMessage.metadata = {
    ...(sanitizedResponseMessage.metadata || {}),
    ...(parentTraceId && { traceId: parentTraceId }),
    ...(searchMode && { searchMode }),
    ...(modelId && { modelId })
  }

  // Wait for title generation if it was started
  const chatTitle = titlePromise ? await titlePromise : undefined

  // Ensure the initial chat/message persistence finished before saving the response
  if (initialSavePromise) {
    const initialSaveStart = performance.now()
    try {
      await initialSavePromise
      perfTime('initial chat persistence awaited', initialSaveStart)
    } catch (error) {
      console.error('Initial chat persistence failed:', error)
      if (initialUserMessage) {
        const fallbackStart = performance.now()
        try {
          await createChatWithFirstMessage(
            chatId,
            initialUserMessage,
            userId,
            DEFAULT_CHAT_TITLE
          )
          perfTime('initial chat persistence fallback completed', fallbackStart)
        } catch (fallbackError) {
          // Check if the error is due to duplicate key (chat already exists)
          const isDuplicateKey =
            fallbackError instanceof Error &&
            (fallbackError.message.includes('duplicate key') ||
              fallbackError.message.includes('unique constraint'))

          if (isDuplicateKey) {
            // Chat already exists, this is fine - continue to save the response message
            console.log(
              'Chat already exists (duplicate key), continuing with response save'
            )
            perfTime(
              'initial chat persistence - duplicate detected',
              fallbackStart
            )
          } else {
            // Other error - log and return
            console.error('Fallback chat creation failed:', fallbackError)
            return
          }
        }
      } else {
        return
      }
    }
  }

  // Save message with retry logic
  const saveStart = performance.now()
  try {
    await upsertMessage(chatId, sanitizedResponseMessage, userId)
    perfTime('upsertMessage (AI response) completed', saveStart)
  } catch (error) {
    console.error('Error saving message:', error)
    try {
      await retryDatabaseOperation(
        () => upsertMessage(chatId, sanitizedResponseMessage, userId),
        'save message'
      )
      perfTime('upsertMessage (AI response) completed after retry', saveStart)
    } catch (retryError) {
      console.error('Failed to save after retries:', retryError)
      // Don't throw here to avoid breaking the stream
    }
  }

  // Update title after message is saved
  if (chatTitle && chatTitle !== DEFAULT_CHAT_TITLE) {
    try {
      await updateChatTitle(chatId, chatTitle, userId)
    } catch (error) {
      console.error('Error updating title:', error)
      // Don't throw here as title update is not critical
    }
  }
}
