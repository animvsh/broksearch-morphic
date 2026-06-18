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
      fallbackPolicy: 'allowed',
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

  it('marks skipped TUI as partial even when generated-app checks pass', () => {
    const evalRecord = buildBrokCodeAcceptanceSuiteEval({
      startedAt: '2026-05-25T00:00:00.000Z',
      completedAt: '2026-05-25T00:01:00.000Z',
      baseUrl: 'https://brok.test',
      matrixMode: true,
      fallbackPolicy: 'allowed',
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

    expect(evalRecord.status).toBe('partial')
    expect(evalRecord.launchGate).toBe(false)
    expect(evalRecord.score).toBe(100)
    expect(formatBrokCodeAcceptanceAdminReview(evalRecord)).toContain(
      'Launch gate: false'
    )
  })

  it('fails the suite when the TUI smoke did not run', () => {
    const evalRecord = buildBrokCodeAcceptanceSuiteEval({
      startedAt: '2026-05-25T00:00:00.000Z',
      completedAt: '2026-05-25T00:01:00.000Z',
      baseUrl: 'https://brok.test',
      matrixMode: true,
      fallbackPolicy: 'allowed',
      tuiStatus: 'not-run',
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
    expect(evalRecord.blockers).toContain('tui: not-run')
  })

  it('classifies rejected no-fallback provider keys as runtime configuration blockers', () => {
    const evalRecord = buildBrokCodeAcceptanceSuiteEval({
      startedAt: '2026-06-17T00:00:00.000Z',
      completedAt: '2026-06-17T00:01:00.000Z',
      baseUrl: 'http://127.0.0.1:3000',
      matrixMode: false,
      fallbackPolicy: 'disallowed',
      tuiStatus: 'skipped',
      cases: [
        {
          id: 'landing-bakery',
          title: 'Landing page',
          category: 'landing',
          status: 'failed',
          checks: ['project-created'],
          startedAt: '2026-06-17T00:00:00.000Z',
          error:
            'BrokCode runtime provider rejected the configured API key. Rotate or replace the provider key, then retry the no-fallback run.'
        }
      ]
    })

    expect(evalRecord.blockers).toEqual([
      'landing-bakery: runtime_configuration - provider API key rejected; rotate or replace the BrokCode Cloud/Pi provider credential and rerun no-fallback smoke.'
    ])
    expect(formatBrokCodeAcceptanceAdminReview(evalRecord)).toContain(
      'runtime_configuration'
    )
  })
})
