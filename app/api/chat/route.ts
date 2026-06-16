import { revalidateTag } from 'next/cache'
import { cookies } from 'next/headers'

import { loadChat } from '@/lib/actions/chat'
import { calculateConversationTurn, trackChatEvent } from '@/lib/analytics'
import {
  getCurrentAppAccess,
  hasFeatureAccess,
  isAppAccessGateEnabled
} from '@/lib/auth/app-access'
import {
  getCurrentUserIdForOptionalGuestSearch,
  isGuestSearchEnabled,
  isGuestSearchMode
} from '@/lib/auth/guest-search'
import { normalizeSearchMode } from '@/lib/config/search-modes'
import { checkAndEnforceAdaptiveLimit } from '@/lib/rate-limit/adaptive-limit'
import { checkAndEnforceOverallChatLimit } from '@/lib/rate-limit/chat-limits'
import { checkAndEnforceGuestLimit } from '@/lib/rate-limit/guest-limit'
import {
  classifyBrokIntent,
  resolveSearchModeForIntent
} from '@/lib/search/intent-router'
import { createChatStreamResponse } from '@/lib/streaming/create-chat-stream-response'
import { createEphemeralChatStreamResponse } from '@/lib/streaming/create-ephemeral-chat-stream-response'
import { createSimpleChatStreamResponse } from '@/lib/streaming/create-simple-chat-stream-response'
import type { SearchMode } from '@/lib/types/search'
import {
  getLatestUserMessage,
  getSimpleUtilityReplyForMessage,
  shouldUseQuickReplyForMessage
} from '@/lib/utils/chat-routing'
import { selectModel } from '@/lib/utils/model-selection'
import { perfLog, perfTime } from '@/lib/utils/perf-logging'
import { resetAllCounters } from '@/lib/utils/perf-tracking'
import { isProviderEnabled } from '@/lib/utils/registry'

export const maxDuration = 300

export async function POST(req: Request) {
  const startTime = performance.now()

  // Reset counters for new request (development only)
  if (process.env.ENABLE_PERF_LOGGING === 'true') {
    resetAllCounters()
  }

  try {
    const body = await req.json()
    const { message, messages, chatId, trigger, messageId, isNewChat, mode } =
      body

    perfLog(
      `API Route - Start: chatId=${chatId}, trigger=${trigger}, isNewChat=${isNewChat}`
    )

    // Handle different triggers using AI SDK standard values
    if (trigger === 'regenerate-message') {
      if (!messageId) {
        return new Response('messageId is required for regeneration', {
          status: 400,
          statusText: 'Bad Request'
        })
      }
    } else if (trigger === 'submit-message') {
      if (!message) {
        return new Response('message is required for submission', {
          status: 400,
          statusText: 'Bad Request'
        })
      }
    }

    const referer = req.headers.get('referer')
    const isSharePage = referer?.includes('/share/')

    const cookieStore = await cookies()

    // Get search mode from cookie
    const searchModeCookie = cookieStore.get('searchMode')?.value
    const requestedSearchMode: SearchMode = normalizeSearchMode(
      typeof mode === 'string' ? mode : searchModeCookie
    )
    const authStart = performance.now()
    const userId =
      await getCurrentUserIdForOptionalGuestSearch(requestedSearchMode)
    perfTime('Auth completed', authStart)
    const isGuest = !userId
    const guestChatEnabled = isGuestSearchEnabled()
    const canUseGuestSearch =
      isGuest && guestChatEnabled && isGuestSearchMode(requestedSearchMode)

    if (isSharePage) {
      return new Response('Chat API is not available on share pages', {
        status: 403,
        statusText: 'Forbidden'
      })
    }

    if (isAppAccessGateEnabled()) {
      const access = await getCurrentAppAccess()
      if (!access.user && !canUseGuestSearch) {
        return new Response('Authentication required', {
          status: 401,
          statusText: 'Unauthorized'
        })
      }

      if (access.user && !access.allowed) {
        return new Response('Access pending', {
          status: 403,
          statusText: 'Forbidden'
        })
      }

      if (access.user && !hasFeatureAccess(access, 'search')) {
        return new Response('Search access denied', {
          status: 403,
          statusText: 'Forbidden'
        })
      }
    }

    if (isGuest && !guestChatEnabled) {
      return new Response('Authentication required', {
        status: 401,
        statusText: 'Unauthorized'
      })
    }

    if (isGuest) {
      const forwardedFor = req.headers.get('x-forwarded-for') || ''
      const ip =
        forwardedFor.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        null
      const guestLimitResponse = await checkAndEnforceGuestLimit(ip)
      if (guestLimitResponse) return guestLimitResponse
    }
    const currentUserMessage =
      message ?? getLatestUserMessage(Array.isArray(messages) ? messages : [])
    const intentDecision = classifyBrokIntent(currentUserMessage)
    const searchMode: SearchMode = shouldUseQuickReplyForMessage(
      currentUserMessage
    )
      ? 'quick'
      : resolveSearchModeForIntent({
          intent: intentDecision.intent,
          requestedSearchMode
        })
    const simpleReply = getSimpleUtilityReplyForMessage(currentUserMessage)
    if (isGuest && !isGuestSearchMode(searchMode)) {
      return new Response(
        JSON.stringify({
          error:
            'Sign in to use Deep Research, Code mode, and private tool workflows. Quick search remains available without an account.',
          mode: searchMode,
          authRequired: true
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    if (simpleReply && trigger === 'submit-message') {
      // Enforce rate limits even for simple utility replies
      if (!isGuest) {
        const overallLimitResponse =
          await checkAndEnforceOverallChatLimit(userId)
        if (overallLimitResponse) return overallLimitResponse
      }
      return createSimpleChatStreamResponse({
        chatId,
        isNewChat,
        message: currentUserMessage,
        modelId: 'brok-utility',
        searchMode,
        text: simpleReply,
        userId
      })
    }

    const selectedModel = await selectModel({ searchMode, cookieStore })

    if (!selectedModel) {
      return new Response('No enabled model is available', {
        status: 503,
        statusText: 'Service Unavailable'
      })
    }

    if (!isProviderEnabled(selectedModel.providerId)) {
      return new Response('The selected Brok model is not available', {
        status: 404,
        statusText: 'Not Found'
      })
    }

    if (!isGuest) {
      if (!chatId) {
        return new Response('Chat ID is required', {
          status: 400,
          statusText: 'Bad Request'
        })
      }

      if (!isNewChat) {
        const existingChat = await loadChat(chatId, userId)
        if (existingChat && existingChat.userId !== userId) {
          return new Response('You are not allowed to access this chat', {
            status: 403,
            statusText: 'Forbidden'
          })
        }
      }

      const overallLimitResponse = await checkAndEnforceOverallChatLimit(userId)
      if (overallLimitResponse) return overallLimitResponse

      if (searchMode === 'deep') {
        const adaptiveLimitResponse = await checkAndEnforceAdaptiveLimit(userId)
        if (adaptiveLimitResponse) return adaptiveLimitResponse
      }
    }

    const streamStart = performance.now()
    perfLog(
      `createChatStreamResponse - Start: model=${selectedModel.providerId}:${selectedModel.id}, searchMode=${searchMode}`
    )

    const response = isGuest
      ? await createEphemeralChatStreamResponse({
          messages: Array.isArray(messages) ? messages : [],
          model: selectedModel,
          abortSignal: undefined,
          searchMode,
          chatId
        })
      : await createChatStreamResponse({
          message,
          model: selectedModel,
          chatId,
          userId: userId, // userId is guaranteed to be non-null after authentication check above
          trigger,
          messageId,
          abortSignal: req.signal,
          isNewChat,
          searchMode
        })

    perfTime('createChatStreamResponse resolved', streamStart)

    // Track analytics event (non-blocking)
    // Calculate conversation turn by loading chat history
    ;(async () => {
      try {
        let conversationTurn = 1 // Default for new chats

        // For existing chats, load history and calculate turn number
        if (!isNewChat && !isGuest) {
          const chat = await loadChat(chatId, userId)
          if (chat?.messages) {
            // Add 1 to account for the current message being sent
            conversationTurn = calculateConversationTurn(chat.messages) + 1
          }
        }

        if (!isGuest && userId) {
          await trackChatEvent({
            searchMode,
            conversationTurn,
            isNewChat: isNewChat ?? false,
            trigger:
              (trigger as 'submit-message' | 'regenerate-message') ??
              'submit-message',
            chatId,
            userId,
            providerId: selectedModel.providerId,
            modelId: selectedModel.id
          })
        }
      } catch (error) {
        // Log error but don't throw - analytics should never break the app
        console.error('Analytics tracking failed:', error)
      }
    })()

    // Invalidate the cache for this specific chat after creating the response
    // This ensures the next load will get fresh data
    if (chatId && !isGuest) {
      revalidateTag(`chat-${chatId}`, 'max')
    }

    const totalTime = performance.now() - startTime
    perfLog(`Total API route time: ${totalTime.toFixed(2)}ms`)
    perfLog(`=== Summary ===`)
    perfLog(`Chat Type: ${isNewChat ? 'NEW' : 'EXISTING'}`)
    perfLog(`Total Time: ${totalTime.toFixed(2)}ms`)
    perfLog(`================`)

    return response
  } catch (error) {
    console.error('API route error:', error)
    return new Response('Error processing your request', {
      status: 500,
      statusText: 'Internal Server Error'
    })
  }
}
