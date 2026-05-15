import { consumeStream, convertToModelMessages, pruneMessages } from 'ai'
import { randomUUID } from 'crypto'
import { Langfuse } from 'langfuse'

import { researcher } from '@/lib/agents/researcher'
import { updateBackgroundTask } from '@/lib/tasks/background-tasks'
import { isTracingEnabled } from '@/lib/utils/telemetry'

import { loadChat } from '../actions/chat'
import { generateChatTitle } from '../agents/title-generator'
import { shouldForceInitialWebSearchForMessage } from '../utils/chat-routing'
import {
  getMaxAllowedTokens,
  shouldTruncateMessages,
  truncateMessages
} from '../utils/context-window'
import { getVisibleTextFromParts } from '../utils/message-utils'
import { perfLog, perfTime } from '../utils/perf-logging'

import { persistStreamResults } from './helpers/persist-stream-results'
import { prepareMessages } from './helpers/prepare-messages'
import { stripReasoningParts } from './helpers/strip-reasoning-parts'
import { stripSpecFromMessages } from './helpers/strip-spec-from-messages'
import type { StreamContext } from './helpers/types'
import { BaseStreamConfig } from './types'

// Constants
const DEFAULT_CHAT_TITLE = 'Untitled'
const GENERIC_CHAT_ERROR =
  'Brok could not complete the request. Please try again.'

export async function createChatStreamResponse(
  config: BaseStreamConfig
): Promise<Response> {
  const {
    message,
    model,
    chatId,
    userId,
    trigger,
    messageId,
    abortSignal,
    isNewChat,
    searchMode,
    taskId
  } = config
  const internalModelId = `${model.providerId}:${model.id}`
  const publicModelId = model.name

  // Verify that chatId is provided
  if (!chatId) {
    return new Response('Chat ID is required', {
      status: 400,
      statusText: 'Bad Request'
    })
  }

  // Skip loading chat for new chats optimization
  let initialChat = null
  if (!isNewChat) {
    const loadChatStart = performance.now()
    // Fetch chat data for authorization check and cache it
    initialChat = await loadChat(chatId, userId)
    perfTime('loadChat completed', loadChatStart)

    // Authorization check: if chat exists, it must belong to the user
    if (initialChat && initialChat.userId !== userId) {
      return new Response('You are not allowed to access this chat', {
        status: 403,
        statusText: 'Forbidden'
      })
    }
  } else {
    perfLog('loadChat skipped for new chat')
  }

  // Create parent trace ID for grouping all operations
  let parentTraceId: string | undefined
  let langfuse: Langfuse | undefined

  if (isTracingEnabled()) {
    parentTraceId = randomUUID()
    langfuse = new Langfuse()

    // Create parent trace with name "research"
    langfuse.trace({
      id: parentTraceId,
      name: 'research',
      metadata: {
        chatId,
        userId,
        modelId: publicModelId,
        trigger
      }
    })
  }

  // Create stream context with trace ID
  const context: StreamContext = {
    chatId,
    userId,
    modelId: internalModelId,
    messageId,
    trigger,
    initialChat,
    abortSignal,
    parentTraceId,
    isNewChat
  }

  // Declare titlePromise in outer scope for onFinish access
  let titlePromise: Promise<string> | undefined

  try {
    // Prepare messages for the model
    const prepareStart = performance.now()
    perfLog(
      `prepareMessages - Invoked: trigger=${trigger}, isNewChat=${isNewChat}`
    )
    const messagesToModel = await prepareMessages(context, message)
    perfTime('prepareMessages completed (stream)', prepareStart)

    // Get the researcher agent with parent trace ID and search mode.
    const researchAgent = researcher({
      model: context.modelId,
      modelConfig: model,
      parentTraceId,
      searchMode,
      userId,
      chatId,
      forceInitialSearch:
        searchMode === 'search' ||
        (searchMode === 'quick' &&
          shouldForceInitialWebSearchForMessage(message))
    })

    // For OpenAI models, strip reasoning parts from UIMessages before conversion
    // OpenAI's Responses API requires reasoning items and their following items to be kept together
    // See: https://github.com/vercel/ai/issues/11036
    const isOpenAI = context.modelId.startsWith('openai:')
    const messagesWithoutSpec = stripSpecFromMessages(messagesToModel)
    const messagesToConvert = isOpenAI
      ? stripReasoningParts(messagesWithoutSpec)
      : messagesWithoutSpec

    // Convert to model messages and apply context window management
    let modelMessages = await convertToModelMessages(messagesToConvert)

    // Prune messages to reduce token usage while keeping recent context
    modelMessages = pruneMessages({
      messages: modelMessages,
      reasoning: 'before-last-message',
      toolCalls: 'before-last-2-messages',
      emptyMessages: 'remove'
    })

    if (shouldTruncateMessages(modelMessages, model)) {
      const maxTokens = getMaxAllowedTokens(model)
      const originalCount = modelMessages.length
      modelMessages = truncateMessages(modelMessages, maxTokens, model.id)

      if (process.env.NODE_ENV === 'development') {
        console.log(
          `Context window limit reached. Truncating from ${originalCount} to ${modelMessages.length} messages`
        )
      }
    }

    // Start title generation in parallel if it's a new chat
    if (!initialChat && message) {
      const userContent = getVisibleTextFromParts(message.parts)
      titlePromise = generateChatTitle({
        userMessageContent: userContent,
        modelId: context.modelId,
        abortSignal,
        parentTraceId
      }).catch(error => {
        console.error('Error generating title:', error)
        return DEFAULT_CHAT_TITLE
      })
    }

    const llmStart = performance.now()
    if (taskId) {
      void updateBackgroundTask({
        id: taskId,
        userId,
        status: 'running',
        metadata: {
          chatId,
          modelId: context.modelId,
          searchMode
        }
      }).catch(error => {
        console.error('Failed to mark chat task running:', error)
      })
    }

    perfLog(
      `researchAgent.stream - Start: model=${context.modelId}, searchMode=${searchMode}`
    )
    const result = await researchAgent.stream({
      messages: modelMessages,
      abortSignal
    })
    result.consumeStream()

    return result.toUIMessageStreamResponse({
      messageMetadata: ({ part }) => {
        if (part.type === 'start') {
          return {
            traceId: parentTraceId,
            searchMode,
            modelId: publicModelId
          }
        }
      },
      onFinish: async ({ responseMessage, isAborted }) => {
        try {
          perfTime('researchAgent.stream completed', llmStart)
          if (!responseMessage) return
          if (isAborted) {
            console.warn(
              `Chat stream for ${chatId} was disconnected by the client; persisting completed server result.`
            )
          }

          // Persist stream results to database
          await persistStreamResults(
            responseMessage,
            chatId,
            userId,
            titlePromise,
            parentTraceId,
            searchMode,
            context.modelId,
            context.pendingInitialSave,
            context.pendingInitialUserMessage
          )

          if (taskId) {
            await updateBackgroundTask({
              id: taskId,
              userId,
              status: 'succeeded',
              result: {
                chatId,
                messageId: responseMessage.id,
                disconnected: isAborted === true
              }
            }).catch(error => {
              console.error('Failed to mark chat task succeeded:', error)
            })
          }
        } finally {
          if (langfuse) {
            await langfuse.flushAsync()
          }
        }
      },
      onError: error => {
        if (taskId) {
          void updateBackgroundTask({
            id: taskId,
            userId,
            status: 'failed',
            error: error instanceof Error ? error.message : GENERIC_CHAT_ERROR
          }).catch(updateError => {
            console.error('Failed to mark chat task failed:', updateError)
          })
        }

        return GENERIC_CHAT_ERROR
      },
      consumeSseStream: consumeStream
    })
  } catch (error) {
    if (taskId) {
      await updateBackgroundTask({
        id: taskId,
        userId,
        status: 'failed',
        error: error instanceof Error ? error.message : GENERIC_CHAT_ERROR
      }).catch(updateError => {
        console.error('Failed to mark chat task failed:', updateError)
      })
    }

    if (langfuse) {
      await langfuse.flushAsync()
    }
    console.error('Stream execution error:', error)
    return new Response(GENERIC_CHAT_ERROR, {
      status: 500,
      statusText: 'Internal Server Error'
    })
  }
}
