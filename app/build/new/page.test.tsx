import type { ReactElement } from 'react'

import { describe, expect, it, vi } from 'vitest'

import BrokBuildNewPage from './page'

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  requireFeatureAccess: vi.fn()
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect
}))

vi.mock('@/lib/auth/app-access', () => ({
  requireFeatureAccess: mocks.requireFeatureAccess
}))

vi.mock('@/components/build/build-workspace', () => ({
  BrokBuildWorkspace: (props: Record<string, unknown>) => (
    <div data-testid="build-workspace" data-props={JSON.stringify(props)} />
  )
}))

describe('BrokBuildNewPage', () => {
  it('requires BrokCode feature access before rendering the build workspace', async () => {
    mocks.requireFeatureAccess.mockResolvedValue(undefined)

    const element = (await BrokBuildNewPage({
      searchParams: Promise.resolve({ prompt: 'Ship a CRM', autostart: '1' })
    })) as ReactElement<{ initialPrompt: string; autoStart: boolean }>

    expect(mocks.requireFeatureAccess).toHaveBeenCalledWith(
      '/build/new',
      'brokcode'
    )
    expect(element.props.initialPrompt).toBe('Ship a CRM')
    expect(element.props.autoStart).toBe(true)
  })
})
