import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentUserIdForOptionalGuestSearch: vi.fn(),
  getModelSelectorData: vi.fn(async () => ({ hasAvailableModels: true })),
  isAnonymousAuthMode: vi.fn(),
  loadChat: vi.fn(),
  requireFeatureAccess: vi.fn(async () => ({ id: 'user-1' }))
}))

vi.mock('@/lib/actions/chat', () => ({
  loadChat: mocks.loadChat
}))

vi.mock('@/lib/auth/app-access', () => ({
  requireFeatureAccess: mocks.requireFeatureAccess
}))

vi.mock('@/lib/auth/get-current-user', () => ({
  isAnonymousAuthMode: mocks.isAnonymousAuthMode
}))

vi.mock('@/lib/auth/guest-search', () => ({
  getCurrentUserIdForOptionalGuestSearch:
    mocks.getCurrentUserIdForOptionalGuestSearch,
  isGuestSearchEnabled: () => false,
  isGuestSearchMode: () => false
}))

vi.mock('@/lib/model-selector/get-model-selector-data', () => ({
  getModelSelectorData: mocks.getModelSelectorData
}))

vi.mock('@/components/brok-search-client', () => ({
  BrokSearchClient: (props: any) => (
    <div
      data-testid="brok-search-client"
      data-id={props.searchId}
      data-mode={props.initialMode}
      data-persist={String(props.persistToServer)}
      data-query={props.initialQuery}
    />
  )
}))

vi.mock('@/components/chat', () => ({
  Chat: (props: any) => (
    <div
      data-testid="chat"
      data-mode={props.initialSearchMode}
      data-query={props.query}
    />
  )
}))

vi.mock('@/components/search/search-landing', () => ({
  SearchLanding: (props: any) => (
    <div
      data-testid="search-landing"
      data-mode={props.defaultMode}
      data-model={props.modelSelectorData?.selectedModelKey ?? 'none'}
    />
  )
}))

import SearchPage from '../page'

describe('SearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.BROK_CLOUD_DEPLOYMENT
    mocks.getCurrentUserIdForOptionalGuestSearch.mockResolvedValue('user-1')
    mocks.isAnonymousAuthMode.mockReturnValue(false)
    mocks.loadChat.mockResolvedValue(null)
  })

  it('passes the URL search mode into the initial search client context', async () => {
    const ui = await SearchPage({
      searchParams: Promise.resolve({
        q: 'climate updates',
        mode: 'deep'
      })
    })

    render(ui)

    expect(screen.getByTestId('brok-search-client')).toHaveAttribute(
      'data-query',
      'climate updates'
    )
    expect(screen.getByTestId('brok-search-client')).toHaveAttribute(
      'data-mode',
      'deep'
    )
    expect(screen.getByTestId('brok-search-client')).toHaveAttribute(
      'data-persist',
      'true'
    )
    expect(mocks.requireFeatureAccess).toHaveBeenCalledWith(
      '/search?q=climate+updates&mode=deep',
      'search'
    )
  })

  it('normalizes invalid URL search modes before rendering search client', async () => {
    const ui = await SearchPage({
      searchParams: Promise.resolve({
        q: 'latest ai news',
        mode: 'invalid'
      })
    })

    render(ui)

    expect(screen.getByTestId('brok-search-client')).toHaveAttribute(
      'data-mode',
      'quick'
    )
    expect(mocks.requireFeatureAccess).toHaveBeenCalledWith(
      '/search?q=latest+ai+news&mode=quick',
      'search'
    )
  })
})
