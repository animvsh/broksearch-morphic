import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  requireFeatureAccess: vi.fn(),
  getModelSelectorData: vi.fn(),
  generateUUID: vi.fn()
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect
}))

vi.mock('@/lib/auth/app-access', () => ({
  requireFeatureAccess: mocks.requireFeatureAccess
}))

vi.mock('@/lib/model-selector/get-model-selector-data', () => ({
  getModelSelectorData: mocks.getModelSelectorData
}))

vi.mock('@/lib/utils', () => ({
  generateUUID: mocks.generateUUID
}))

vi.mock('@/components/chat', () => ({
  Chat: ({ id, query }: { id: string; query?: string }) => (
    <div data-testid="chat">
      {id}:{query}
    </div>
  )
}))

vi.mock('@/components/search/search-landing', () => ({
  SearchLanding: ({
    isCloudDeployment,
    hasModels
  }: {
    isCloudDeployment?: boolean
    hasModels?: boolean
  }) => (
    <div data-testid="search-landing">
      {String(isCloudDeployment)}:{String(hasModels)}
    </div>
  )
}))

import SearchPage from './page'

describe('app/search/page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the search landing surface for bare /search requests', async () => {
    mocks.requireFeatureAccess.mockResolvedValue({})
    mocks.getModelSelectorData.mockResolvedValue({ hasAvailableModels: true })

    render(await SearchPage({ searchParams: Promise.resolve({ q: '' }) }))

    expect(mocks.requireFeatureAccess).toHaveBeenCalledWith('/search', 'search')
    expect(mocks.getModelSelectorData).toHaveBeenCalledOnce()
    expect(screen.getByTestId('search-landing')).toHaveTextContent('false:true')
  })

  it('renders chat for query-backed search requests', async () => {
    mocks.requireFeatureAccess.mockResolvedValue({})
    mocks.generateUUID.mockReturnValue('chat-id')
    mocks.getModelSelectorData.mockResolvedValue({ hasAvailableModels: true })

    render(
      await SearchPage({
        searchParams: Promise.resolve({ q: 'latest ai funding' })
      })
    )

    expect(mocks.requireFeatureAccess).toHaveBeenCalledWith(
      '/search?q=latest%20ai%20funding',
      'search'
    )
    expect(mocks.generateUUID).toHaveBeenCalledOnce()
    expect(mocks.getModelSelectorData).toHaveBeenCalledOnce()
    expect(screen.getByTestId('chat')).toHaveTextContent(
      'chat-id:latest ai funding'
    )
  })
})
