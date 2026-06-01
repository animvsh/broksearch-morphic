import { describe, expect, it } from 'vitest'

import {
  buildBrokCodeAcceptanceSuiteEval,
  formatBrokCodeAcceptanceAdminReview
} from '../acceptance-eval'

describe('BrokCode acceptance eval', () => {
  it('summarizes pass rate and admin blockers', () => {
    const evalRecord = buildBrokCodeAcceptanceSuiteEval({
      startedAt: '2026-05-25T00:00:00.000Z',
      completedAt: '2026-05-25T00:01:00.000Z',
      baseUrl: 'https://brok.test',
      matrixMode: true,
      tuiStatus: 'passed',
      cases: [
        {
          id: 'landing-bakery',
          title: 'Landing page',
          category: 'landing',
          status: 'passed',
          checks: ['project-created', 'managed-deploy'],
          startedAt: '2026-05-25T00:00:00.000Z',
          completedAt: '2026-05-25T00:00:30.000Z',
          projectId: 'project-1',
          previewUrl: '/api/brokcode/previews/project-1/index.html',
          deploymentUrl: '/brokcode/apps/demo--project-1/index.html'
        },
        {
          id: 'club-crud',
          title: 'CRUD data app',
          category: 'crud',
          status: 'failed',
          checks: ['project-created'],
          startedAt: '2026-05-25T00:00:30.000Z',
          completedAt: '2026-05-25T00:01:00.000Z',
          error: 'preview missing useful interaction'
        }
      ]
    })

    expect(evalRecord).toMatchObject({
      kind: 'brokcode_acceptance_eval',
      status: 'failed',
      score: 50,
      passCount: 1,
      failCount: 1,
      totalCount: 2,
      blockers: ['club-crud: preview missing useful interaction']
    })

    expect(formatBrokCodeAcceptanceAdminReview(evalRecord)).toContain(
      'Score: 50%'
    )
  })

  it('requires the TUI smoke for a full pass', () => {
    const evalRecord = buildBrokCodeAcceptanceSuiteEval({
      startedAt: '2026-05-25T00:00:00.000Z',
      completedAt: '2026-05-25T00:01:00.000Z',
      baseUrl: 'https://brok.test',
      matrixMode: true,
      tuiStatus: 'skipped',
      cases: [
        {
          id: 'landing-bakery',
          title: 'Landing page',
          category: 'landing',
          status: 'passed',
          checks: ['managed-deploy'],
          startedAt: '2026-05-25T00:00:00.000Z'
        }
      ]
    })

    expect(evalRecord.status).toBe('failed')
    expect(evalRecord.score).toBe(100)
  })
})
