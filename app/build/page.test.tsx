import type { ReactElement } from 'react'

import { describe, expect, it, vi } from 'vitest'

import BrokBuildIndexPage from './page'

const mocks = vi.hoisted(() => ({
  requireFeatureAccess: vi.fn()
}))

vi.mock('@/lib/auth/app-access', () => ({
  requireFeatureAccess: mocks.requireFeatureAccess
}))

vi.mock('@/components/build/empty-state', () => ({
  BrokBuildEmptyState: (props: Record<string, unknown>) => (
    <div data-testid="build-empty-state" data-props={JSON.stringify(props)} />
  )
}))

describe('BrokBuildIndexPage', () => {
  it('requires BrokCode feature access before rendering builder', async () => {
    mocks.requireFeatureAccess.mockResolvedValue(undefined)

    const element = (await BrokBuildIndexPage()) as ReactElement<{
      chips: unknown[]
    }>

    expect(mocks.requireFeatureAccess).toHaveBeenCalledWith(
      '/build',
      'brokcode'
    )
    expect(element.props.chips.length).toBeGreaterThan(0)
  })
})
