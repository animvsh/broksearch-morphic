import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  loadChat: vi.fn(),
  requireFeatureAccess: vi.fn(),
  getCurrentUserId: vi.fn(),
  isAnonymousAuthMode: vi.fn(),
  getModelSelectorData: vi.fn(),
  generateUUID: vi.fn()
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
  getCurrentUserId: mocks.getCurrentUserId,
  isAnonymousAuthMode: mocks.isAnonymousAuthMode
}))

vi.mock('@/lib/model-selector/get-model-selector-data', () => ({
  getModelSelectorData: mocks.getModelSelectorData
}))

vi.mock('@/lib/utils', () => ({
  generateUUID: mocks.generateUUID
}))

vi.mock('@/components/chat', () => ({
  Chat: ({
    id,
    query,
    savedMessages,
    initialQueryMessageId,
    initialSearchMode,
    isGuest
  }: {
    id: string
    query?: string
    savedMessages?: Array<{ role: string; parts?: Array<{ text?: string }> }>
    initialQueryMessageId?: string
    initialSearchMode?: string
    isGuest?: boolean
  }) => (
    <div data-testid="chat">
      {id}:{query}:{initialQueryMessageId}:{initialSearchMode}:
      {savedMessages?.length ?? 0}:{String(isGuest)}:
      {savedMessages?.[1]?.parts?.[0]?.text ?? ''}
    </div>
  )
}))

vi.mock('@/components/brok-search-client', () => ({
  BrokSearchClient: ({
    initialQuery,
    initialMessages,
    initialMode,
    persistToServer,
    searchId
  }: {
    initialQuery?: string
    initialMessages?: unknown[]
    initialMode?: string
    persistToServer?: boolean
    searchId?: string
  }) => (
    <div data-testid="brok-search-client">
      {searchId}:{initialQuery}:{initialMode}:{initialMessages?.length ?? 0}:
      {String(persistToServer)}
    </div>
  )
}))

vi.mock('@/components/search/search-landing', () => ({
  SearchLanding: ({
    defaultMode,
    isCloudDeployment,
    hasModels,
    modelSelectorData
  }: {
    defaultMode?: string
    isCloudDeployment?: boolean
    hasModels?: boolean
    modelSelectorData?: { selectedModelKey?: string }
  }) => (
    <div data-testid="search-landing">
      {String(isCloudDeployment)}:{String(hasModels)}:{defaultMode}:
      {modelSelectorData?.selectedModelKey ?? 'none'}
    </div>
  )
}))

import SearchPage from './page'

const originalEnableGuestChat = process.env.ENABLE_GUEST_CHAT
const originalBrokCloudDeployment = process.env.BROK_CLOUD_DEPLOYMENT

describe('app/search/page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    process.env.ENABLE_GUEST_CHAT = originalEnableGuestChat
    process.env.BROK_CLOUD_DEPLOYMENT = originalBrokCloudDeployment
    mocks.isAnonymousAuthMode.mockReturnValue(false)
    mocks.getCurrentUserId.mockResolvedValue('user-1')
    mocks.loadChat.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    process.env.ENABLE_GUEST_CHAT = originalEnableGuestChat
    process.env.BROK_CLOUD_DEPLOYMENT = originalBrokCloudDeployment
  })

  it('renders the search landing surface for bare /search requests', async () => {
    mocks.requireFeatureAccess.mockResolvedValue({})
    mocks.getModelSelectorData.mockResolvedValue({
      hasAvailableModels: true,
      selectedModelKey: 'openai-compatible:brok-m2-5-highspeed'
    })

    render(await SearchPage({ searchParams: Promise.resolve({ q: '' }) }))

    expect(mocks.requireFeatureAccess).toHaveBeenCalledWith(
      '/search?mode=quick',
      'search'
    )
    expect(mocks.getModelSelectorData).toHaveBeenCalledOnce()
    expect(screen.getByTestId('search-landing')).toHaveTextContent(
      'false:true:quick:openai-compatible:brok-m2-5-highspeed'
    )
  })

  it('renders the browser-safe stream client for new query-backed searches', async () => {
    mocks.requireFeatureAccess.mockResolvedValue({})
    mocks.getModelSelectorData.mockResolvedValue({ hasAvailableModels: true })

    render(
      await SearchPage({
        searchParams: Promise.resolve({
          q: 'latest ai funding',
          mode: 'search'
        })
      })
    )

    expect(mocks.requireFeatureAccess).toHaveBeenCalledWith(
      '/search?q=latest+ai+funding&mode=search',
      'search'
    )
    expect(mocks.loadChat).toHaveBeenCalledOnce()
    expect(mocks.getModelSelectorData).toHaveBeenCalledOnce()
    const clientText =
      screen.getByTestId('brok-search-client').textContent ?? ''
    expect(clientText).toContain(':latest ai funding:search:0:true')
    expect(clientText).toMatch(/^search_[a-f0-9]{48}:/)
  })

  it('normalizes invalid search modes before auth redirects', async () => {
    mocks.requireFeatureAccess.mockResolvedValue({})
    mocks.getModelSelectorData.mockResolvedValue({ hasAvailableModels: true })

    render(
      await SearchPage({
        searchParams: Promise.resolve({
          q: 'latest ai funding',
          mode: 'unknown'
        })
      })
    )

    expect(mocks.requireFeatureAccess).toHaveBeenCalledWith(
      '/search?q=latest+ai+funding&mode=quick',
      'search'
    )
    expect(screen.getByTestId('brok-search-client')).toHaveTextContent(
      ':latest ai funding:quick:0:true'
    )
  })

  it('server-seeds tiny utility answers instead of waiting for client auto-submit', async () => {
    mocks.requireFeatureAccess.mockResolvedValue({})
    mocks.generateUUID
      .mockReturnValueOnce('user-id')
      .mockReturnValueOnce('assistant-id')
    mocks.getModelSelectorData.mockResolvedValue({ hasAvailableModels: true })

    render(
      await SearchPage({
        searchParams: Promise.resolve({ q: 'jo', mode: 'quick' })
      })
    )

    expect(mocks.requireFeatureAccess).toHaveBeenCalledWith(
      '/search?q=jo&mode=quick',
      'search'
    )
    expect(screen.getByTestId('chat')).toHaveTextContent('::search_')
    expect(screen.getByTestId('chat')).toHaveTextContent(
      ':quick:2:false:I need a little more to search well.'
    )
  })

  it('loads an existing query-backed chat instead of passing query for replay', async () => {
    mocks.requireFeatureAccess.mockResolvedValue({})
    mocks.getModelSelectorData.mockResolvedValue({ hasAvailableModels: true })
    mocks.loadChat.mockResolvedValue({
      messages: [
        {
          id: 'stable-user-message',
          role: 'user',
          parts: [{ type: 'text', text: 'latest ai funding' }]
        },
        {
          id: 'assistant-message',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Existing answer' }]
        }
      ]
    })

    render(
      await SearchPage({
        searchParams: Promise.resolve({
          q: 'latest ai funding',
          mode: 'search'
        })
      })
    )

    expect(screen.queryByTestId('chat')).not.toBeInTheDocument()
    expect(screen.getByTestId('brok-search-client')).toHaveTextContent(
      'latest ai funding:search:2:true'
    )
  })

  it('preserves mode for bare search landing redirects', async () => {
    mocks.requireFeatureAccess.mockResolvedValue({})
    mocks.getModelSelectorData.mockResolvedValue({ hasAvailableModels: true })

    render(
      await SearchPage({
        searchParams: Promise.resolve({ mode: 'deep' })
      })
    )

    expect(mocks.requireFeatureAccess).toHaveBeenCalledWith(
      '/search?mode=deep',
      'search'
    )
    expect(screen.getByTestId('search-landing')).toHaveTextContent(
      'false:true:deep'
    )
  })

  it('allows guest query-backed search when guest chat is enabled', async () => {
    process.env.ENABLE_GUEST_CHAT = 'true'
    mocks.getCurrentUserId.mockResolvedValue(undefined)
    mocks.getModelSelectorData.mockResolvedValue({ hasAvailableModels: true })

    render(
      await SearchPage({
        searchParams: Promise.resolve({
          q: 'latest ai funding',
          mode: 'search'
        })
      })
    )

    expect(mocks.requireFeatureAccess).not.toHaveBeenCalled()
    expect(mocks.loadChat).not.toHaveBeenCalled()
    expect(screen.getByTestId('brok-search-client')).toHaveTextContent(
      ':latest ai funding:search:0:false'
    )
  })

  it('defaults local development query-backed search to guest mode when guest chat is unset', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('BROK_CLOUD_DEPLOYMENT', 'false')
    delete process.env.ENABLE_GUEST_CHAT
    mocks.getCurrentUserId.mockResolvedValue(undefined)
    mocks.getModelSelectorData.mockResolvedValue({ hasAvailableModels: true })

    render(
      await SearchPage({
        searchParams: Promise.resolve({
          q: 'latest ai funding',
          mode: 'search'
        })
      })
    )

    expect(mocks.requireFeatureAccess).not.toHaveBeenCalled()
    expect(mocks.loadChat).not.toHaveBeenCalled()
    expect(screen.getByTestId('brok-search-client')).toHaveTextContent(
      'latest ai funding:search:0:false'
    )
  })

  it('honors explicit local guest search disablement for query-backed search', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('BROK_CLOUD_DEPLOYMENT', 'false')
    vi.stubEnv('ENABLE_GUEST_CHAT', 'false')
    mocks.getCurrentUserId.mockResolvedValue(undefined)
    mocks.requireFeatureAccess.mockResolvedValue({})
    mocks.getModelSelectorData.mockResolvedValue({ hasAvailableModels: true })

    render(
      await SearchPage({
        searchParams: Promise.resolve({
          q: 'latest ai funding',
          mode: 'search'
        })
      })
    )

    expect(mocks.requireFeatureAccess).toHaveBeenCalledWith(
      '/search?q=latest+ai+funding&mode=search',
      'search'
    )
    expect(mocks.loadChat).not.toHaveBeenCalled()
  })

  it('falls back to guest search when auth lookup fails for guest-enabled search', async () => {
    process.env.ENABLE_GUEST_CHAT = 'true'
    mocks.getCurrentUserId.mockRejectedValue(new TypeError('Failed to fetch'))
    mocks.getModelSelectorData.mockResolvedValue({ hasAvailableModels: true })

    render(
      await SearchPage({
        searchParams: Promise.resolve({
          q: 'latest ai funding',
          mode: 'search'
        })
      })
    )

    expect(mocks.requireFeatureAccess).not.toHaveBeenCalled()
    expect(mocks.loadChat).not.toHaveBeenCalled()
    expect(screen.getByTestId('brok-search-client')).toHaveTextContent(
      ':latest ai funding:search:0:false'
    )
  })

  it('uses the stream client in local anonymous auth mode without loading chat storage', async () => {
    process.env.ENABLE_GUEST_CHAT = 'true'
    mocks.isAnonymousAuthMode.mockReturnValue(true)
    mocks.getCurrentUserId.mockResolvedValue(
      '00000000-0000-0000-0000-000000000000'
    )
    mocks.getModelSelectorData.mockResolvedValue({ hasAvailableModels: true })

    render(
      await SearchPage({
        searchParams: Promise.resolve({
          q: 'what is react in one sentence',
          mode: 'quick'
        })
      })
    )

    expect(mocks.requireFeatureAccess).not.toHaveBeenCalled()
    expect(mocks.loadChat).not.toHaveBeenCalled()
    expect(screen.getByTestId('brok-search-client')).toHaveTextContent(
      ':what is react in one sentence:quick:0:false'
    )
  })

  it('keeps guest deep search behind feature access', async () => {
    process.env.ENABLE_GUEST_CHAT = 'true'
    mocks.getCurrentUserId.mockResolvedValue(undefined)
    mocks.requireFeatureAccess.mockResolvedValue({})
    mocks.getModelSelectorData.mockResolvedValue({ hasAvailableModels: true })

    render(
      await SearchPage({
        searchParams: Promise.resolve({
          q: 'latest ai funding',
          mode: 'deep'
        })
      })
    )

    expect(mocks.requireFeatureAccess).toHaveBeenCalledWith(
      '/search?q=latest+ai+funding&mode=deep',
      'search'
    )
    expect(mocks.loadChat).not.toHaveBeenCalled()
  })
})
