import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runBuildStream: vi.fn()
}))

vi.mock('@/lib/build/stream', () => ({
  runBuildStream: mocks.runBuildStream
}))

import { startBrokBuild } from '@/lib/actions/build'

describe('startBrokBuild', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.runBuildStream.mockResolvedValue({
      classification: { appType: 'crm', confidence: 0.9, tags: [] },
      internalPlan: {},
      userPlan: {},
      projectId: null,
      events: []
    })
  })

  test('does not preallocate a BrokCode project id for fresh builds', async () => {
    await startBrokBuild({ prompt: 'Build a support CRM' })

    expect(mocks.runBuildStream).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Build a support CRM',
        projectId: undefined
      })
    )
  })

  test('passes explicit continuation project ids through to the stream', async () => {
    await startBrokBuild({
      prompt: 'Add task reminders',
      projectId: 'project-existing-1'
    })

    expect(mocks.runBuildStream).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Add task reminders',
        projectId: 'project-existing-1'
      })
    )
  })
})
