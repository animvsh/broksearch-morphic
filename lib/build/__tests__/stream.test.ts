import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  createBrokCodeProject,
  getBrokCodeProject,
  listBrokCodeProjectDeployments,
  listBrokCodeProjectFiles,
  upsertBrokCodeProjectFile
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
    expect(result.events.some(e => e.kind === 'backend_plan')).toBe(true)
    expect(result.events.some(e => e.kind === 'opencode_session')).toBe(false)
    expect(result.events.some(e => e.kind === 'backend_status')).toBe(false)
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
    expect(result.events).toContainEqual({
      kind: 'done',
      projectId: null,
      previewUrl: null
    })
    expect(result.projectId).toBeNull()
  }, 15000)

  it('persists an authenticated build through BrokCode execution when available', async () => {
    const syncDir = await mkdtemp(path.join(tmpdir(), 'brok-build-project-'))
    const previousStorage = process.env.BROKCODE_PROJECT_STORAGE
    const previousSyncDir = process.env.BROKCODE_SYNC_DIR
    process.env.BROKCODE_PROJECT_STORAGE = 'file'
    process.env.BROKCODE_SYNC_DIR = syncDir
    let executionPrompt = ''

    try {
      const result = await runBuildStream({
        prompt: 'Build me a CRM with login, customers, notes, and tasks',
        brokCodeProject: {
          workspaceId: '00000000-0000-0000-0000-000000000003',
          userId: 'user_test',
          request: {
            headers: new Headers({ host: 'localhost:3000' }),
            url: 'http://localhost:3000/api/build/stream'
          },
          executeBrokCodeBuild: async ({ prompt, projectId, workspaceId }) => {
            executionPrompt = prompt
            await upsertBrokCodeProjectFile({
              projectId,
              workspaceId,
              path: 'index.html',
              content:
                '<!doctype html><html><body><main><h1>CRM</h1></main></body></html>',
              language: 'html'
            })
            await upsertBrokCodeProjectFile({
              projectId,
              workspaceId,
              path: 'styles.css',
              content: 'body { font-family: system-ui; }',
              language: 'css'
            })
            return {
              preview_url: `http://localhost:3000/api/brokcode/previews/${projectId}`,
              generated_files: ['index.html', 'styles.css'],
              runtime: 'pi',
              note: 'Built with BrokCode Cloud.'
            }
          }
        }
      })
      const projectEvent = result.events.find(
        event => event.kind === 'brokcode_project'
      )

      expect(projectEvent).toMatchObject({
        kind: 'brokcode_project',
        previewUrl: expect.stringContaining('/api/brokcode/previews/'),
        deploymentUrl: null,
        fileCount: 2,
        source: 'brokcode_execute',
        degraded: false
      })
      expect(executionPrompt).toContain(
        'Return named files for index.html, styles.css, and app.js.'
      )
      expect(executionPrompt).toContain('Do not install packages')
      expect(executionPrompt).toContain('Write the complete file contents')
      expect(executionPrompt).toContain(
        'Create a compact CRM Login Customers Notes Tasks app prototype.'
      )
      expect(executionPrompt).toContain(
        'Build one responsive dashboard-style app screen'
      )
      expect(executionPrompt).toContain('mock account/status panel')
      expect(executionPrompt).toContain('attachment/file list UI')
      expect(executionPrompt).toContain('Tables: users, customers, notes, tasks')
      expect(result.projectId).toBeTruthy()
      const persistedProjectId = result.projectId
      if (!persistedProjectId) {
        throw new Error('Expected a persisted BrokCode project id.')
      }
      expect(result.events).toContainEqual({
        kind: 'preview_url',
        url: expect.stringContaining('/api/brokcode/previews/')
      })

      const project = await getBrokCodeProject({
        id: persistedProjectId,
        workspaceId: '00000000-0000-0000-0000-000000000003',
        userId: 'user_test'
      })
      expect(project).toMatchObject({
        id: persistedProjectId,
        status: 'preview_ready',
        previewUrl: expect.stringContaining('/api/brokcode/previews/'),
        deploymentUrl: null
      })
      const previewMetadata = project?.metadata?.preview as
        | Record<string, unknown>
        | undefined
      expect(previewMetadata?.backendPlan).toMatchObject({
        provider: 'insforge',
        status: 'planned',
        tables: expect.arrayContaining([
          expect.objectContaining({ name: 'customers' }),
          expect.objectContaining({ name: 'notes' }),
          expect.objectContaining({ name: 'tasks' })
        ])
      })
      expect(previewMetadata?.backendPlanStatus).toBe('planned')

      const files = await listBrokCodeProjectFiles({
        projectId: persistedProjectId,
        workspaceId: '00000000-0000-0000-0000-000000000003'
      })
      expect(files.map(file => file.path).sort()).toEqual([
        'index.html',
        'styles.css'
      ])

      const deployments = await listBrokCodeProjectDeployments({
        projectId: persistedProjectId,
        workspaceId: '00000000-0000-0000-0000-000000000003',
        userId: 'user_test'
      })
      expect(deployments).toHaveLength(0)
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

  it('continues an authenticated build in the requested BrokCode project', async () => {
    const syncDir = await mkdtemp(path.join(tmpdir(), 'brok-build-edit-'))
    const previousStorage = process.env.BROKCODE_PROJECT_STORAGE
    const previousSyncDir = process.env.BROKCODE_SYNC_DIR
    process.env.BROKCODE_PROJECT_STORAGE = 'file'
    process.env.BROKCODE_SYNC_DIR = syncDir

    try {
      const project = await createBrokCodeProject({
        workspaceId: '00000000-0000-0000-0000-000000000003',
        userId: 'user_test',
        name: 'Existing CRM'
      })
      await upsertBrokCodeProjectFile({
        projectId: project.id,
        workspaceId: '00000000-0000-0000-0000-000000000003',
        path: 'index.html',
        content: '<!doctype html><html><body>Old CRM</body></html>',
        language: 'html'
      })

      const result = await runBuildStream({
        prompt:
          'The InsForge backend has been provisioned and its planned resources were applied.\n\nEdit request: add premium onboarding',
        projectId: project.id,
        brokCodeProject: {
          workspaceId: '00000000-0000-0000-0000-000000000003',
          userId: 'user_test',
          request: {
            headers: new Headers({ host: 'localhost:3000' }),
            url: 'http://localhost:3000/api/build/stream'
          },
          executeBrokCodeBuild: async ({ projectId, workspaceId }) => {
            await upsertBrokCodeProjectFile({
              projectId,
              workspaceId,
              path: 'onboarding.js',
              content:
                "const NEXT_PUBLIC_INSFORGE_URL = 'https://example.insforge.app';\nconst NEXT_PUBLIC_INSFORGE_APP_KEY = 'if_public_demo';\nexport async function loadCustomers() { return fetch(`${NEXT_PUBLIC_INSFORGE_URL}/api/database/tables/customers/records?appKey=${NEXT_PUBLIC_INSFORGE_APP_KEY}`); }",
              language: 'js'
            })
            return {
              preview_url: `http://localhost:3000/api/brokcode/previews/${projectId}`,
              generated_files: ['onboarding.js'],
              runtime: 'pi',
              note: 'Edited existing BrokCode project.'
            }
          }
        }
      })

      expect(result.projectId).toBe(project.id)
      const projectEvent = result.events.find(
        event => event.kind === 'brokcode_project'
      )
      expect(projectEvent).toMatchObject({
        kind: 'brokcode_project',
        projectId: project.id,
        source: 'brokcode_execute',
        degraded: false
      })

      const updatedProject = await getBrokCodeProject({
        id: project.id,
        workspaceId: '00000000-0000-0000-0000-000000000003',
        userId: 'user_test'
      })
      expect(updatedProject?.metadata?.preview).toMatchObject({
        beforeFileCount: 1,
        source: 'brok_build_execute',
        note: 'Edited existing BrokCode project.',
        backendRewire: {
          provider: 'insforge',
          status: 'rewired'
        }
      })
      const files = await listBrokCodeProjectFiles({
        projectId: project.id,
        workspaceId: '00000000-0000-0000-0000-000000000003'
      })
      expect(files.map(file => file.path).sort()).toEqual([
        'index.html',
        'onboarding.js'
      ])
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

  it('marks fallback builds as degraded and does not record a deployment', async () => {
    const syncDir = await mkdtemp(path.join(tmpdir(), 'brok-build-fallback-'))
    const previousStorage = process.env.BROKCODE_PROJECT_STORAGE
    const previousSyncDir = process.env.BROKCODE_SYNC_DIR
    process.env.BROKCODE_PROJECT_STORAGE = 'file'
    process.env.BROKCODE_SYNC_DIR = syncDir

    try {
      const result = await runBuildStream({
        prompt: 'Build me a CRM with login, customers, notes, and tasks',
        brokCodeProject: {
          workspaceId: '00000000-0000-0000-0000-000000000003',
          userId: 'user_test',
          request: {
            headers: new Headers({ host: 'localhost:3000' }),
            url: 'http://localhost:3000/api/build/stream'
          },
          executeBrokCodeBuild: async () => {
            throw new Error('BrokCode Cloud runtime is required.')
          }
        }
      })

      const projectEvent = result.events.find(
        event => event.kind === 'brokcode_project'
      )
      expect(projectEvent).toMatchObject({
        kind: 'brokcode_project',
        source: 'degraded_fallback',
        degraded: true,
        deploymentUrl: null,
        fileCount: 3
      })
      expect(
        result.events.some(
          event =>
            event.kind === 'log' &&
            event.level === 'warn' &&
            event.message.includes('degraded')
        )
      ).toBe(true)
      expect(result.projectId).toBeTruthy()
      const persistedProjectId = result.projectId
      if (!persistedProjectId) {
        throw new Error('Expected a degraded fallback project id.')
      }

      const project = await getBrokCodeProject({
        id: persistedProjectId,
        workspaceId: '00000000-0000-0000-0000-000000000003',
        userId: 'user_test'
      })
      expect(project?.status).toBe('preview_ready')
      expect(project?.deploymentUrl).toBeNull()
      expect(project?.metadata?.preview).toMatchObject({
        mode: 'degraded_fallback',
        source: 'brok_build_degraded_fallback',
        degraded: true,
        executionError: 'BrokCode Cloud runtime is required.',
        backendPlan: expect.objectContaining({
          provider: 'insforge',
          status: 'planned'
        })
      })

      const deployments = await listBrokCodeProjectDeployments({
        projectId: persistedProjectId,
        workspaceId: '00000000-0000-0000-0000-000000000003',
        userId: 'user_test'
      })
      expect(deployments).toHaveLength(0)
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

  it('fails closed when BrokCode execution is required for build proof', async () => {
    const syncDir = await mkdtemp(path.join(tmpdir(), 'brok-build-required-'))
    const previousStorage = process.env.BROKCODE_PROJECT_STORAGE
    const previousSyncDir = process.env.BROKCODE_SYNC_DIR
    process.env.BROKCODE_PROJECT_STORAGE = 'file'
    process.env.BROKCODE_SYNC_DIR = syncDir

    try {
      const result = await runBuildStream({
        prompt: 'Build me a CRM with login, customers, notes, and tasks',
        brokCodeProject: {
          workspaceId: '00000000-0000-0000-0000-000000000003',
          userId: 'user_test',
          request: {
            headers: new Headers({ host: 'localhost:3000' }),
            url: 'http://localhost:3000/api/build/stream'
          },
          requireBrokCodeExecution: true,
          executeBrokCodeBuild: async () => {
            throw new Error('The operation timed out.')
          }
        }
      })

      expect(
        result.events.some(event => event.kind === 'brokcode_project')
      ).toBe(false)
      expect(result.events).toContainEqual({
        kind: 'error',
        message:
          'BrokCode execution required for Brok Build but failed: The operation timed out.'
      })
      expect(result.events.some(event => event.kind === 'files')).toBe(false)
      expect(
        result.events.some(event => event.kind === 'phase' && event.phase === 'ready')
      ).toBe(false)
      expect(result.projectId).toBeNull()
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

  it('fails closed instead of creating a new app for a stale continuation project id', async () => {
    const syncDir = await mkdtemp(path.join(tmpdir(), 'brok-build-stale-'))
    const previousStorage = process.env.BROKCODE_PROJECT_STORAGE
    const previousSyncDir = process.env.BROKCODE_SYNC_DIR
    process.env.BROKCODE_PROJECT_STORAGE = 'file'
    process.env.BROKCODE_SYNC_DIR = syncDir

    try {
      const result = await runBuildStream({
        prompt: 'Edit the current CRM',
        projectId: 'missing-project-id',
        brokCodeProject: {
          workspaceId: '00000000-0000-0000-0000-000000000003',
          userId: 'user_test',
          request: {
            headers: new Headers({ host: 'localhost:3000' }),
            url: 'http://localhost:3000/api/build/stream'
          },
          requireBrokCodeExecution: true,
          executeBrokCodeBuild: async () => {
            throw new Error('should not execute')
          }
        }
      })

      expect(result.projectId).toBeNull()
      expect(result.events).toContainEqual({
        kind: 'error',
        message:
          'Selected BrokCode project was not found. Refresh the builder and try again.'
      })
      expect(
        result.events.some(event => event.kind === 'brokcode_project')
      ).toBe(false)
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
      expect(paths.some(p => p.includes('lib/brokcode'))).toBe(true)
    }
  }, 15000)

  it('does not claim live OpenCode, InsForge, or Railway work for starter scaffolds', async () => {
    const result = await runBuildStream({
      prompt: 'Build me a CRM with login, customers, notes, and tasks',
      projectId: 'brok-test-honesty'
    })
    const visibleText = result.events
      .flatMap(event => {
        if (event.kind === 'phase') return [event.message]
        if (event.kind === 'log') return [event.message]
        if (event.kind === 'plan') return Object.values(event.plan)
        if (event.kind === 'internal_plan') {
          return [
            event.internalPlan.backend,
            event.internalPlan.hosting,
            event.internalPlan.coding_agent
          ]
        }
        if (event.kind === 'backend_plan') {
          return [
            event.plan.provider,
            event.plan.status,
            ...event.plan.applySteps
          ]
        }
        return []
      })
      .join(' ')

    expect(visibleText.replace(/BrokCode/g, '')).not.toMatch(/OpenCode/i)
    expect(visibleText).not.toMatch(/Railway/i)
    expect(visibleText).toMatch(/BrokCode/i)
    expect(visibleText).toMatch(/insforge/i)
    expect(visibleText).toMatch(/planned/i)
    expect(visibleText).not.toMatch(/connected|provisioned|deployed/i)
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
