import { describe, expect, it } from 'vitest'

import {
  advanceBrokCodeRunLifecycle,
  createBrokCodeRunLifecycle
} from '../run-lifecycle'

describe('BrokCode run lifecycle', () => {
  it('starts with a queued durable run', () => {
    const lifecycle = createBrokCodeRunLifecycle()

    expect(lifecycle).toHaveLength(8)
    expect(lifecycle[0]).toMatchObject({
      id: 'queued',
      status: 'running'
    })
    expect(lifecycle.map(step => step.id)).toEqual([
      'queued',
      'context_load',
      'generation',
      'build',
      'preview',
      'checks',
      'deploy',
      'done'
    ])
  })

  it('advances through generation, files, preview, and final result', () => {
    let state = createBrokCodeRunLifecycle()

    state = advanceBrokCodeRunLifecycle({
      current: state,
      event: 'status',
      payload: { message: 'Planning the build.' }
    }).steps
    expect(state.find(step => step.id === 'context_load')).toMatchObject({
      status: 'running'
    })

    state = advanceBrokCodeRunLifecycle({
      current: state,
      event: 'delta',
      payload: { content: 'writing code' }
    }).steps
    expect(state.find(step => step.id === 'generation')).toMatchObject({
      status: 'running'
    })

    state = advanceBrokCodeRunLifecycle({
      current: state,
      event: 'files',
      payload: { count: 3 }
    }).steps
    expect(state.find(step => step.id === 'build')).toMatchObject({
      status: 'done'
    })
    expect(state.find(step => step.id === 'preview')).toMatchObject({
      status: 'running'
    })

    state = advanceBrokCodeRunLifecycle({
      current: state,
      event: 'preview',
      payload: { preview_url: '/api/brokcode/previews/project/index.html' }
    }).steps
    expect(state.find(step => step.id === 'checks')).toMatchObject({
      status: 'running'
    })

    const final = advanceBrokCodeRunLifecycle({
      current: state,
      event: 'result',
      payload: { preview_url: '/api/brokcode/previews/project/index.html' }
    })

    expect(final.progress).toBe(100)
    expect(final.phase).toBe('done')
    expect(final.steps.find(step => step.id === 'deploy')).toMatchObject({
      status: 'skipped'
    })
    expect(final.steps.find(step => step.id === 'done')).toMatchObject({
      status: 'done'
    })
  })

  it('marks the active and terminal steps as errored', () => {
    const started = advanceBrokCodeRunLifecycle({
      current: createBrokCodeRunLifecycle(),
      event: 'delta',
      payload: { content: 'partial output' }
    }).steps
    const failed = advanceBrokCodeRunLifecycle({
      current: started,
      event: 'error',
      payload: { message: 'runtime failed' }
    })

    expect(failed.steps.find(step => step.id === 'generation')).toMatchObject({
      status: 'error'
    })
    expect(failed.steps.find(step => step.id === 'done')).toMatchObject({
      status: 'error'
    })
  })
})
