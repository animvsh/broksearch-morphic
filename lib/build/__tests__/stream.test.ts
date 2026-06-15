import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  getBrokCodeProject,
  listBrokCodeProjectDeployments,
  listBrokCodeProjectFiles
} from '@/lib/brokcode/project-store'
import { classifyApp } from '@/lib/build/app-types'
import { runBuildStream } from '@/lib/build/stream'
import { PHASE_LABELS } from '@/lib/build/types'

describe('runBuildStream', () => {
  it('produces the canonical phase sequence and ends in ready', async () => {
    const events: string[] = []
    const result = await runBuildStream({
      prompt: 'Build me a mobile-first AI nutrition tracker',
      projectId: 'brok-test-1',
      emit: event => {
        if (event.kind === 'phase') events.push(event.phase)
      }
    })

    const phaseSequence = events.filter(
      p => p !== 'idle' && p !== 'adjusting'
    )
    expect(phaseSequence[0]).toBe('understanding')
    expect(phaseSequence).toContain('planning_core_modules')
    expect(phaseSequence).toContain('designing_backend_schema')
    expect(phaseSequence).toContain('preparing_backend')
    expect(phaseSequence).toContain('starting_opencode')
    expect(phaseSequence).toContain('generating_frontend')
    expect(phaseSequence).toContain('wiring_backend')
    expect(phaseSequence).toContain('building_preview')
    expect(phaseSequence[phaseSequence.length - 1]).toBe('ready')
    expect(result.classification.appType).toBe('mobile_first_pwa')
    expect(result.internalPlan.project_type).toBe('mobile_first_pwa')
    expect(result.userPlan.bullets.length).toBeGreaterThan(2)
    expect(result.events.some(e => e.kind === 'plan')).toBe(true)
    expect(result.events.some(e => e.kind === 'internal_plan')).toBe(true)
    expect(result.events.some(e => e.kind === 'opencode_session')).toBe(true)
    expect(result.events.some(e => e.kind === 'backend_status')).toBe(true)
    expect(result.events.some(e => e.kind === 'files')).toBe(true)
    expect(result.events.some(e => e.kind === 'preview_url')).toBe(true)
    expect(result.events.some(e => e.kind === 'done')).toBe(true)
    expect(result.events).toContainEqual({
      kind: 'preview_url',
      url: null
    })
    expect(result.events).toContainEqual({
      kind: 'phase',
      phase: 'ready',
      message: 'Project scaffold ready. Sign in to open a managed preview.'
    })
  }, 15000)

  it('persists an authenticated build as a BrokCode managed preview project', async () => {
    const syncDir = await mkdtemp(path.join(tmpdir(), 'brok-build-project-'))
    const previousStorage = process.env.BROKCODE_PROJECT_STORAGE
    const previousSyncDir = process.env.BROKCODE_SYNC_DIR
    process.env.BROKCODE_PROJECT_STORAGE = 'file'
    process.env.BROKCODE_SYNC_DIR = syncDir

    try {
      const result = await runBuildStream({
        prompt: 'Build me a CRM with login, customers, notes, and tasks',
        projectId: 'brok-test-persist',
        brokCodeProject: {
          workspaceId: '00000000-0000-0000-0000-000000000003',
          userId: 'user_test',
          request: {
            headers: new Headers({ host: 'localhost:3000' }),
            url: 'http://localhost:3000/api/build/stream'
          }
        }
      })
      const projectEvent = result.events.find(
        event => event.kind === 'brokcode_project'
      )

      expect(projectEvent).toMatchObject({
        kind: 'brokcode_project',
        previewUrl: expect.stringContaining('/api/brokcode/previews/'),
        deploymentUrl: expect.stringContaining('/brokcode/apps/'),
        fileCount: 3
      })
      expect(result.projectId).not.toBe('brok-test-persist')
      expect(result.events).toContainEqual({
        kind: 'preview_url',
        url: expect.stringContaining('/api/brokcode/previews/')
      })

      const project = await getBrokCodeProject({
        id: result.projectId,
        workspaceId: '00000000-0000-0000-0000-000000000003',
        userId: 'user_test'
      })
      expect(project).toMatchObject({
        id: result.projectId,
        status: 'deployed',
        previewUrl: expect.stringContaining('/api/brokcode/previews/'),
        deploymentUrl: expect.stringContaining('/brokcode/apps/')
      })

      const files = await listBrokCodeProjectFiles({
        projectId: result.projectId,
        workspaceId: '00000000-0000-0000-0000-000000000003'
      })
      expect(files.map(file => file.path).sort()).toEqual([
        'app.js',
        'index.html',
        'styles.css'
      ])

      const deployments = await listBrokCodeProjectDeployments({
        projectId: result.projectId,
        workspaceId: '00000000-0000-0000-0000-000000000003',
        userId: 'user_test'
      })
      expect(deployments).toHaveLength(1)
      expect(deployments[0]).toMatchObject({
        provider: 'managed_preview',
        status: 'deployed'
      })
    } finally {
      if (previousStorage === undefined) {
        delete process.env.BROKCODE_PROJECT_STORAGE
      } else {
        process.env.BROKCODE_PROJECT_STORAGE = previousStorage
      }
      if (previousSyncDir === undefined) {
        delete process.env.BROKCODE_SYNC_DIR
      } else {
        process.env.BROKCODE_SYNC_DIR = previousSyncDir
      }
      await rm(syncDir, { recursive: true, force: true })
    }
  }, 15000)

  it('emits file previews that match the plan pages', async () => {
    const result = await runBuildStream({
      prompt: 'Build me a CRM with login, customers, notes, and tasks',
      projectId: 'brok-test-2'
    })
    const filesEvent = result.events.find(e => e.kind === 'files')
    expect(filesEvent).toBeDefined()
    if (filesEvent && filesEvent.kind === 'files') {
      const paths = filesEvent.files.map(f => f.path)
      expect(paths).toContain('app/page.tsx')
      expect(paths.some(p => p.includes('lib/insforge'))).toBe(true)
    }
  }, 15000)

  it('classifies non-AI prompts and still produces a build stream', async () => {
    const result = await runBuildStream({
      prompt: 'Build me a simple landing page',
      projectId: 'brok-test-3'
    })
    expect(result.classification.appType).toBe('landing_page')
    expect(result.classification.isAiApp).toBe(false)
  }, 15000)

  it('handles cancel/abort signals', async () => {
    const ctrl = new AbortController()
    const promise = runBuildStream({
      prompt: 'Build me an AI chat app',
      projectId: 'brok-test-4',
      signal: ctrl.signal
    })
    ctrl.abort()
    await expect(promise).rejects.toThrow()
  }, 15000)
})

describe('PHASE_LABELS', () => {
  it('has labels for all canonical phases', () => {
    for (const phase of [
      'understanding',
      'planning_core_modules',
      'designing_backend_schema',
      'preparing_backend',
      'starting_opencode',
      'generating_frontend',
      'wiring_backend',
      'building_preview',
      'ready'
    ]) {
      expect(PHASE_LABELS[phase]).toBeTruthy()
    }
  })
})

describe('classifyApp / runBuildStream integration', () => {
  it('produces a CRM internal plan via classifier', () => {
    const cls = classifyApp('Build me a CRM with login, customers, notes, and tasks')
    expect(cls.appType).toBe('crm')
  })
})
