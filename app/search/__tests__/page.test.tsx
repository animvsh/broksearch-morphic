import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import SearchPage from '../page'

const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
  getModelSelectorData: vi.fn(async () => ({ hasAvailableModels: true })),
  requireFeatureAccess: vi.fn(async () => ({ id: 'user-1' }))
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn()
}))

vi.mock('@/lib/auth/app-access', () => ({
  requireFeatureAccess: mocks.requireFeatureAccess
}))

vi.mock('@/lib/model-selector/get-model-selector-data', () => ({
  getModelSelectorData: mocks.getModelSelectorData
}))

vi.mock('@/lib/utils', () => ({
  generateUUID: () => 'search-chat-id'
}))

vi.mock('@/components/chat', () => ({
  Chat: (props: any) => {
    mocks.chat(props)
    return (
      <div
        data-testid="chat"
        data-id={props.id}
        data-query={props.query}
        data-mode={props.initialSearchMode}
      />
    )
  }
}))

describe('SearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.BROK_CLOUD_DEPLOYMENT
  })

  it('passes the URL search mode into the initial chat request context', async () => {
    const ui = await SearchPage({
      searchParams: Promise.resolve({
        q: 'climate updates',
        mode: 'deep'
      })
    })

    render(ui)

    expect(screen.getByTestId('chat')).toHaveAttribute(
      'data-id',
      'search-chat-id'
    )
    expect(screen.getByTestId('chat')).toHaveAttribute(
      'data-query',
      'climate updates'
    )
    expect(screen.getByTestId('chat')).toHaveAttribute('data-mode', 'deep')
    expect(mocks.requireFeatureAccess).toHaveBeenCalledWith(
      '/search?q=climate+updates&mode=deep',
      'search'
    )
  })

  it('normalizes invalid URL search modes before rendering chat', async () => {
    const ui = await SearchPage({
      searchParams: Promise.resolve({
        q: 'latest ai news',
        mode: 'invalid'
      })
    })

    render(ui)

    expect(screen.getByTestId('chat')).toHaveAttribute('data-mode', 'quick')
    expect(mocks.requireFeatureAccess).toHaveBeenCalledWith(
      '/search?q=latest+ai+news&mode=quick',
      'search'
    )
  })
})
