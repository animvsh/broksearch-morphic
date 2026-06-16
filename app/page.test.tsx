import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  getAppAccessForUser: vi.fn(),
  hasFeatureAccess: vi.fn(),
  getCurrentUser: vi.fn(),
  getModelSelectorData: vi.fn()
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect
}))

vi.mock('@/lib/auth/app-access', () => ({
  getAppAccessForUser: mocks.getAppAccessForUser,
  hasFeatureAccess: mocks.hasFeatureAccess
}))

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: mocks.getCurrentUser
}))

vi.mock('@/lib/model-selector/get-model-selector-data', () => ({
  getModelSelectorData: mocks.getModelSelectorData
}))

vi.mock('@/components/brok/brok-landing', () => ({
  BrokLanding: ({ isSignedIn }: { isSignedIn: boolean }) => (
    <div data-testid="brok-landing">{String(isSignedIn)}</div>
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

import Page from './page'

const originalEnableGuestChat = process.env.ENABLE_GUEST_CHAT

describe('app/page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ENABLE_GUEST_CHAT = originalEnableGuestChat
    delete process.env.BROK_CLOUD_DEPLOYMENT
    mocks.getCurrentUser.mockResolvedValue(null)
    mocks.getAppAccessForUser.mockResolvedValue({ allowed: false })
    mocks.hasFeatureAccess.mockReturnValue(false)
    mocks.getModelSelectorData.mockResolvedValue({ hasAvailableModels: true })
  })

  afterEach(() => {
    process.env.ENABLE_GUEST_CHAT = originalEnableGuestChat
    delete process.env.BROK_CLOUD_DEPLOYMENT
  })

  it('renders the search-first landing for signed-out users when guest search is enabled', async () => {
    process.env.ENABLE_GUEST_CHAT = 'true'
    process.env.BROK_CLOUD_DEPLOYMENT = 'true'

    render(await Page())

    expect(screen.getByTestId('search-landing')).toHaveTextContent('true:true')
    expect(screen.queryByTestId('brok-landing')).not.toBeInTheDocument()
    expect(mocks.getModelSelectorData).toHaveBeenCalledOnce()
  })

  it('keeps the invite landing when signed-out guest search is disabled', async () => {
    process.env.ENABLE_GUEST_CHAT = 'false'

    render(await Page())

    expect(screen.getByTestId('brok-landing')).toHaveTextContent('false')
    expect(screen.queryByTestId('search-landing')).not.toBeInTheDocument()
  })
})
