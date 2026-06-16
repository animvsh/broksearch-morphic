import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  loadChat: vi.fn(),
  requireFeatureAccess: vi.fn(),
  getCurrentUser: vi.fn(),
  getModelSelectorData: vi.fn()
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect
}))

vi.mock('@/lib/actions/chat', () => ({
  loadChat: mocks.loadChat
}))

vi.mock('@/lib/auth/app-access', () => ({
  requireFeatureAccess: mocks.requireFeatureAccess
}))

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: mocks.getCurrentUser
}))

vi.mock('@/lib/model-selector/get-model-selector-data', () => ({
  getModelSelectorData: mocks.getModelSelectorData
}))

vi.mock('@/components/chat', () => ({
  Chat: ({
    id,
    savedMessages,
    isGuest
  }: {
    id: string
    savedMessages?: unknown[]
    isGuest?: boolean
  }) => (
    <div data-testid="chat">
      {id}:{savedMessages?.length ?? 0}:{String(isGuest)}
    </div>
  )
}))

import SearchPage from './page'

const originalEnableGuestChat = process.env.ENABLE_GUEST_CHAT

describe('app/search/[id]/page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ENABLE_GUEST_CHAT = originalEnableGuestChat
    mocks.getCurrentUser.mockResolvedValue({ id: 'user-1' })
    mocks.loadChat.mockResolvedValue({
      visibility: 'private',
      messages: [{ id: 'message-1', role: 'user', parts: [] }]
    })
    mocks.getModelSelectorData.mockResolvedValue({ hasAvailableModels: true })
  })

  afterEach(() => {
    process.env.ENABLE_GUEST_CHAT = originalEnableGuestChat
  })

  it('renders saved signed-in chats from server storage', async () => {
    render(await SearchPage({ params: Promise.resolve({ id: 'chat-1' }) }))

    expect(mocks.loadChat).toHaveBeenCalledWith('chat-1', 'user-1')
    expect(mocks.requireFeatureAccess).toHaveBeenCalledWith(
      '/search/chat-1',
      'search'
    )
    expect(screen.getByTestId('chat')).toHaveTextContent('chat-1:1:false')
  })

  it('allows guest search answer pages to hydrate from local storage', async () => {
    process.env.ENABLE_GUEST_CHAT = 'true'
    mocks.getCurrentUser.mockRejectedValue(new TypeError('Failed to fetch'))
    mocks.loadChat.mockResolvedValue(null)

    render(
      await SearchPage({
        params: Promise.resolve({ id: 'search_local_guest_answer' })
      })
    )

    expect(mocks.loadChat).not.toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
    expect(screen.getByTestId('chat')).toHaveTextContent(
      'search_local_guest_answer:0:true'
    )
  })

  it('redirects unknown non-search guest routes', async () => {
    process.env.ENABLE_GUEST_CHAT = 'true'
    mocks.getCurrentUser.mockRejectedValue(new TypeError('Failed to fetch'))
    mocks.loadChat.mockResolvedValue(null)

    render(
      await SearchPage({ params: Promise.resolve({ id: 'chat-unknown' }) })
    )

    expect(mocks.redirect).toHaveBeenCalledWith('/')
  })
})
