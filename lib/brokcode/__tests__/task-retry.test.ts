import { describe, expect, it } from 'vitest'

import { buildBrokCodeTaskRetryRequest } from '../task-retry'

describe('BrokCode task retry payloads', () => {
  it('rebuilds an execute payload from durable task metadata', () => {
    const result = buildBrokCodeTaskRetryRequest({
      id: 'task_123',
      kind: 'brokcode',
      status: 'failed',
      metadata: {
        originalRequest: {
          command: 'Build a student project portal',
          model: 'brok-code',
          source: 'browser',
          sessionId: 'course-101',
          projectId: 'project_456',
          backendProvider: 'insforge',
          backendStatus: 'ready',
          backendProjectUrl: 'https://backend.example.com',
          preferPi: true,
          requirePi: false,
          requireOpenCode: false,
          allowBrokFallback: true
        }
      }
    })

    expect(result).toEqual({
      ok: true,
      retry: {
        command: 'Build a student project portal',
        model: 'brok-code',
        source: 'browser',
        session_id: 'course-101',
        project_id: 'project_456',
        backend_provider: 'insforge',
        backend_status: 'ready',
        backend_project_url: 'https://backend.example.com',
        prefer_pi: true,
        require_pi: false,
        require_opencode: false,
        allow_brok_fallback: true,
        retry_of_task_id: 'task_123'
      }
    })
  })

  it('rejects non-BrokCode tasks', () => {
    expect(
      buildBrokCodeTaskRetryRequest({
        id: 'task_123',
        kind: 'deep-research',
        metadata: {
          originalRequest: {
            command: 'Research university builders'
          }
        }
      })
    ).toMatchObject({
      ok: false,
      status: 400
    })
  })

  it('rejects old tasks without an original request', () => {
    expect(
      buildBrokCodeTaskRetryRequest({
        id: 'task_123',
        kind: 'brokcode',
        metadata: {
          command: 'Build from an old task'
        }
      })
    ).toMatchObject({
      ok: false,
      status: 409
    })
  })

  it('rejects active and already successful tasks', () => {
    const task = {
      id: 'task_123',
      kind: 'brokcode',
      metadata: {
        originalRequest: {
          command: 'Build a student project portal'
        }
      }
    }

    expect(
      buildBrokCodeTaskRetryRequest({
        ...task,
        status: 'queued'
      })
    ).toMatchObject({
      ok: false,
      status: 409,
      error:
        'This BrokCode task is still running. Wait for it to finish or cancel it before retrying.'
    })

    expect(
      buildBrokCodeTaskRetryRequest({
        ...task,
        status: 'running'
      })
    ).toMatchObject({
      ok: false,
      status: 409,
      error:
        'This BrokCode task is still running. Wait for it to finish or cancel it before retrying.'
    })

    expect(
      buildBrokCodeTaskRetryRequest({
        ...task,
        status: 'succeeded'
      })
    ).toMatchObject({
      ok: false,
      status: 409,
      error:
        'This BrokCode task already succeeded. Start a new edit instead of retrying it.'
    })
  })
})
