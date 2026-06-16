import type { ReactElement } from 'react'

import { describe, expect, it, vi } from 'vitest'

import BrokCodePage from './page'

const mocks = vi.hoisted(() => ({
  requireFeatureAccess: vi.fn(),
  getRequiredBrokAccountUser: vi.fn(),
  redirect: vi.fn()
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect
}))

vi.mock('@/lib/auth/app-access', () => ({
  requireFeatureAccess: mocks.requireFeatureAccess
}))

vi.mock('@/lib/brokcode/account-guard', () => ({
  getRequiredBrokAccountUser: mocks.getRequiredBrokAccountUser
}))

vi.mock('@/components/brokcode/brokcode-app', () => ({
  BrokCodeApp: (props: Record<string, unknown>) => (
    <div data-testid="brokcode-app-props" data-props={JSON.stringify(props)} />
  )
}))

describe('BrokCodePage', () => {
  it('passes the requested project id into the BrokCode handoff', async () => {
    mocks.requireFeatureAccess.mockResolvedValue(undefined)
    mocks.getRequiredBrokAccountUser.mockResolvedValue({
      email: 'user@example.com'
    })

    const element = (await BrokCodePage({
      searchParams: Promise.resolve({
        prompt: 'ship it',
        autostart: '1',
        connect: 'github',
        project: 'project-123'
      })
    })) as ReactElement<{
      initialProjectId: string | null
      initialPrompt: string
      autoStart: boolean
      connectGithub: boolean
    }>

    expect(element.props.initialProjectId).toBe('project-123')
    expect(element.props.initialPrompt).toBe('ship it')
    expect(element.props.autoStart).toBe(true)
    expect(element.props.connectGithub).toBe(true)
  })
})
