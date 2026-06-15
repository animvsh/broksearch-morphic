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
  Chat: ({
    id,
    query,
    initialSearchMode
  }: {
    id: string
    query?: string
    initialSearchMode?: string
  }) => (
    <div data-testid="chat">
      {id}:{query}:{initialSearchMode}
    </div>
  )
}))

vi.mock('@/components/search/search-landing', () => ({
  SearchLanding: ({
    defaultMode,
    isCloudDeployment,
    hasModels
  }: {
    defaultMode?: string
    isCloudDeployment?: boolean
    hasModels?: boolean
  }) => (
    <div data-testid="search-landing">
      {String(isCloudDeployment)}:{String(hasModels)}:{defaultMode}
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

    expect(mocks.requireFeatureAccess).toHaveBeenCalledWith(
      '/search?mode=quick',
      'search'
    )
    expect(mocks.getModelSelectorData).toHaveBeenCalledOnce()
    expect(screen.getByTestId('search-landing')).toHaveTextContent(
      'false:true:quick'
    )
  })

  it('renders chat for query-backed search requests with the requested mode', async () => {
    mocks.requireFeatureAccess.mockResolvedValue({})
    mocks.generateUUID.mockReturnValue('chat-id')
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
    expect(mocks.generateUUID).toHaveBeenCalledOnce()
    expect(mocks.getModelSelectorData).toHaveBeenCalledOnce()
    expect(screen.getByTestId('chat')).toHaveTextContent(
      'chat-id:latest ai funding:search'
    )
  })

  it('normalizes invalid search modes before auth redirects', async () => {
    mocks.requireFeatureAccess.mockResolvedValue({})
    mocks.generateUUID.mockReturnValue('chat-id')
    mocks.getModelSelectorData.mockResolvedValue({ hasAvailableModels: true })

    render(
      await SearchPage({
        searchParams: Promise.resolve({ q: 'hello', mode: 'unknown' })
      })
    )

    expect(mocks.requireFeatureAccess).toHaveBeenCalledWith(
      '/search?q=hello&mode=quick',
      'search'
    )
    expect(screen.getByTestId('chat')).toHaveTextContent('chat-id:hello:quick')
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
})
