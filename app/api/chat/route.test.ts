import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  cookieGet: vi.fn(),
  loadChat: vi.fn(),
  calculateConversationTurn: vi.fn(),
  trackChatEvent: vi.fn(),
  getCurrentAppAccess: vi.fn(),
  hasFeatureAccess: vi.fn(),
  isAppAccessGateEnabled: vi.fn(),
  getCurrentUserId: vi.fn(),
  checkAndEnforceAdaptiveLimit: vi.fn(),
  checkAndEnforceOverallChatLimit: vi.fn(),
  checkAndEnforceGuestLimit: vi.fn(),
  classifyBrokIntent: vi.fn(),
  resolveSearchModeForIntent: vi.fn(),
  createChatStreamResponse: vi.fn(),
  createEphemeralChatStreamResponse: vi.fn(),
  createSimpleChatStreamResponse: vi.fn(),
  getLatestUserMessage: vi.fn(),
  getSimpleUtilityReplyForMessage: vi.fn(),
  shouldUseQuickReplyForMessage: vi.fn(),
  selectModel: vi.fn(),
  isProviderEnabled: vi.fn()
}))

vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: mocks.cookieGet
  }))
}))

vi.mock('@/lib/actions/chat', () => ({
  loadChat: mocks.loadChat
}))

vi.mock('@/lib/analytics', () => ({
  calculateConversationTurn: mocks.calculateConversationTurn,
  trackChatEvent: mocks.trackChatEvent
}))

vi.mock('@/lib/auth/app-access', () => ({
  getCurrentAppAccess: mocks.getCurrentAppAccess,
  hasFeatureAccess: mocks.hasFeatureAccess,
  isAppAccessGateEnabled: mocks.isAppAccessGateEnabled
}))

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUserId: mocks.getCurrentUserId
}))

vi.mock('@/lib/rate-limit/adaptive-limit', () => ({
  checkAndEnforceAdaptiveLimit: mocks.checkAndEnforceAdaptiveLimit
}))

vi.mock('@/lib/rate-limit/chat-limits', () => ({
  checkAndEnforceOverallChatLimit: mocks.checkAndEnforceOverallChatLimit
}))

vi.mock('@/lib/rate-limit/guest-limit', () => ({
  checkAndEnforceGuestLimit: mocks.checkAndEnforceGuestLimit
}))

vi.mock('@/lib/search/intent-router', () => ({
  classifyBrokIntent: mocks.classifyBrokIntent,
  resolveSearchModeForIntent: mocks.resolveSearchModeForIntent
}))

vi.mock('@/lib/streaming/create-chat-stream-response', () => ({
  createChatStreamResponse: mocks.createChatStreamResponse
}))

vi.mock('@/lib/streaming/create-ephemeral-chat-stream-response', () => ({
  createEphemeralChatStreamResponse: mocks.createEphemeralChatStreamResponse
}))

vi.mock('@/lib/streaming/create-simple-chat-stream-response', () => ({
  createSimpleChatStreamResponse: mocks.createSimpleChatStreamResponse
}))

vi.mock('@/lib/utils/chat-routing', () => ({
  getLatestUserMessage: mocks.getLatestUserMessage,
  getSimpleUtilityReplyForMessage: mocks.getSimpleUtilityReplyForMessage,
  shouldUseQuickReplyForMessage: mocks.shouldUseQuickReplyForMessage
}))

vi.mock('@/lib/utils/model-selection', () => ({
  selectModel: mocks.selectModel
}))

vi.mock('@/lib/utils/perf-logging', () => ({
  perfLog: vi.fn(),
  perfTime: vi.fn()
}))

vi.mock('@/lib/utils/perf-tracking', () => ({
  resetAllCounters: vi.fn()
}))

vi.mock('@/lib/utils/registry', () => ({
  isProviderEnabled: mocks.isProviderEnabled
}))

import { POST } from './route'

const originalEnableGuestChat = process.env.ENABLE_GUEST_CHAT

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.10'
    },
    body: JSON.stringify(body)
  })
}

describe('POST /api/chat guest search gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ENABLE_GUEST_CHAT = originalEnableGuestChat

    mocks.cookieGet.mockReturnValue(undefined)
    mocks.getCurrentUserId.mockResolvedValue(undefined)
    mocks.isAppAccessGateEnabled.mockReturnValue(true)
    mocks.getCurrentAppAccess.mockResolvedValue({
      allowed: false,
      user: null,
      reason: 'unauthenticated'
    })
    mocks.hasFeatureAccess.mockReturnValue(true)
    mocks.checkAndEnforceGuestLimit.mockResolvedValue(null)
    mocks.classifyBrokIntent.mockReturnValue({ intent: 'search' })
    mocks.resolveSearchModeForIntent.mockReturnValue('search')
    mocks.shouldUseQuickReplyForMessage.mockReturnValue(false)
    mocks.getSimpleUtilityReplyForMessage.mockReturnValue(null)
    mocks.selectModel.mockResolvedValue({
      id: 'brok-search',
      providerId: 'openai'
    })
    mocks.isProviderEnabled.mockReturnValue(true)
    mocks.createEphemeralChatStreamResponse.mockResolvedValue(
      new Response('guest stream', { status: 200 })
    )
    mocks.createChatStreamResponse.mockResolvedValue(
      new Response('user stream', { status: 200 })
    )
  })

  afterEach(() => {
    process.env.ENABLE_GUEST_CHAT = originalEnableGuestChat
  })

  it('allows unauthenticated search-mode requests through the app access gate when guest chat is enabled', async () => {
    process.env.ENABLE_GUEST_CHAT = 'true'

    const response = await POST(
      makeRequest({
        message: 'latest ai funding',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'latest' }] }],
        chatId: 'guest-chat',
        trigger: 'submit-message',
        isNewChat: true,
        mode: 'search'
      })
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('guest stream')
    expect(mocks.checkAndEnforceGuestLimit).toHaveBeenCalledWith('203.0.113.10')
    expect(mocks.createEphemeralChatStreamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'guest-chat',
        searchMode: 'search'
      })
    )
    expect(mocks.loadChat).not.toHaveBeenCalled()
    expect(mocks.createChatStreamResponse).not.toHaveBeenCalled()
  })

  it('falls back to guest streaming when auth lookup fails for guest-enabled search', async () => {
    process.env.ENABLE_GUEST_CHAT = 'true'
    mocks.getCurrentUserId.mockRejectedValue(new TypeError('Failed to fetch'))

    const response = await POST(
      makeRequest({
        message: 'latest ai funding',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'latest' }] }],
        chatId: 'guest-chat',
        trigger: 'submit-message',
        isNewChat: true,
        mode: 'search'
      })
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('guest stream')
    expect(mocks.createEphemeralChatStreamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'guest-chat',
        searchMode: 'search'
      })
    )
  })

  it('requires authentication for guest requests when the guest flag is disabled', async () => {
    const response = await POST(
      makeRequest({
        message: 'latest ai funding',
        chatId: 'guest-chat',
        trigger: 'submit-message',
        isNewChat: true,
        mode: 'search'
      })
    )

    expect(response.status).toBe(401)
    expect(await response.text()).toBe('Authentication required')
    expect(mocks.checkAndEnforceGuestLimit).not.toHaveBeenCalled()
    expect(mocks.createEphemeralChatStreamResponse).not.toHaveBeenCalled()
  })

  it('keeps deep mode gated for unauthenticated guests', async () => {
    process.env.ENABLE_GUEST_CHAT = 'true'

    const response = await POST(
      makeRequest({
        message: 'research this deeply',
        chatId: 'guest-chat',
        trigger: 'submit-message',
        isNewChat: true,
        mode: 'deep'
      })
    )

    expect(response.status).toBe(401)
    expect(await response.text()).toBe('Authentication required')
    expect(mocks.createEphemeralChatStreamResponse).not.toHaveBeenCalled()
  })
})
