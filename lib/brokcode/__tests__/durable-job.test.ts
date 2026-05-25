import { describe, expect, it } from 'vitest'

import {
  BROKCODE_JOB_STALE_MS,
  buildStaleBrokCodeLifecycle,
  createBrokCodeWorkerMetadata,
  isStaleBrokCodeTask
} from '../durable-job'

describe('BrokCode durable job liveness', () => {
  it('does not mark active in-process jobs stale', () => {
    const now = new Date('2026-05-25T12:00:00.000Z')
    const old = new Date(now.getTime() - BROKCODE_JOB_STALE_MS - 1000)

    expect(
      isStaleBrokCodeTask({
        task: {
          id: 'task_active',
          kind: 'brokcode',
          status: 'running',
          userId: 'user_1',
          updatedAt: old
        },
        activeTaskIds: new Set(['task_active']),
        now
      })
    ).toBe(false)
  })

  it('marks abandoned queued and running BrokCode jobs stale', () => {
    const now = new Date('2026-05-25T12:00:00.000Z')
    const old = new Date(now.getTime() - BROKCODE_JOB_STALE_MS - 1000)

    expect(
      isStaleBrokCodeTask({
        task: {
          id: 'task_queued',
          kind: 'brokcode',
          status: 'queued',
          userId: 'user_1',
          updatedAt: old
        },
        activeTaskIds: new Set(),
        now
      })
    ).toBe(true)
    expect(
      isStaleBrokCodeTask({
        task: {
          id: 'task_running',
          kind: 'brokcode',
          status: 'running',
          userId: 'user_1',
          metadata: createBrokCodeWorkerMetadata({
            taskId: 'task_running',
            leaseId: 'lease_1',
            now: old
          }),
          updatedAt: old
        },
        activeTaskIds: new Set(),
        now
      })
    ).toBe(true)
  })

  it('does not mark fresh or terminal tasks stale', () => {
    const now = new Date('2026-05-25T12:00:00.000Z')
    const old = new Date(now.getTime() - BROKCODE_JOB_STALE_MS - 1000)

    expect(
      isStaleBrokCodeTask({
        task: {
          id: 'task_done',
          kind: 'brokcode',
          status: 'succeeded',
          userId: 'user_1',
          updatedAt: old
        },
        activeTaskIds: new Set(),
        now
      })
    ).toBe(false)
    expect(
      isStaleBrokCodeTask({
        task: {
          id: 'task_fresh',
          kind: 'brokcode',
          status: 'running',
          userId: 'user_1',
          updatedAt: now
        },
        activeTaskIds: new Set(),
        now
      })
    ).toBe(false)
  })

  it('builds a retryable failure lifecycle for abandoned jobs', () => {
    const lifecycle = buildStaleBrokCodeLifecycle()

    expect(lifecycle.phase).toBe('done')
    expect(lifecycle.steps.find(step => step.id === 'queued')).toMatchObject({
      status: 'error'
    })
    expect(lifecycle.steps.find(step => step.id === 'done')).toMatchObject({
      status: 'error'
    })
  })
})
