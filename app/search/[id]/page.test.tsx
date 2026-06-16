import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  loadChat: vi.fn(),
  requireFeatureAccess: vi.fn(),
  getCurrentUser: vi.fn(),
  isAnonymousAuthMode: vi.fn(),
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
  getCurrentUser: mocks.getCurrentUser,
  isAnonymousAuthMode: mocks.isAnonymousAuthMode
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

vi.mock('@/components/brok-search-client', () => ({
  BrokSearchClient: ({
    persistToServer,
    searchId
  }: {
    persistToServer?: boolean
    searchId?: string
  }) => (
    <div data-testid="brok-search-client">
      {searchId}:{String(persistToServer)}
    </div>
  )
}))

import SearchPage from './page'

const originalEnableGuestChat = process.env.ENABLE_GUEST_CHAT

describe('app/search/[id]/page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ENABLE_GUEST_CHAT = originalEnableGuestChat
    mocks.isAnonymousAuthMode.mockReturnValue(false)
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
    expect(screen.getByTestId('brok-search-client')).toHaveTextContent(
      'search_local_guest_answer'
    )
  })

  it('allows local anonymous search answer pages without loading chat storage', async () => {
    process.env.ENABLE_GUEST_CHAT = 'true'
    mocks.isAnonymousAuthMode.mockReturnValue(true)
    mocks.getCurrentUser.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000000'
    })
    mocks.loadChat.mockResolvedValue(null)

    render(
      await SearchPage({
        params: Promise.resolve({ id: 'search_local_anonymous_answer' })
      })
    )

    expect(mocks.loadChat).not.toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
    expect(screen.getByTestId('brok-search-client')).toHaveTextContent(
      'search_local_anonymous_answer'
    )
  })

  it('hydrates signed-in query-backed search pages when server chat is missing', async () => {
    mocks.loadChat.mockResolvedValue(null)

    render(
      await SearchPage({
        params: Promise.resolve({ id: 'search_signed_in_answer' })
      })
    )

    expect(mocks.loadChat).toHaveBeenCalledWith(
      'search_signed_in_answer',
      'user-1'
    )
    expect(mocks.redirect).not.toHaveBeenCalled()
    expect(screen.getByTestId('brok-search-client')).toHaveTextContent(
      'search_signed_in_answer:true'
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
