import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createBrokCodeProject,
  getBrokCodeProject,
  getBrokCodeProjectByHandle,
  listBrokCodeProjectFiles,
  listBrokCodeProjects,
  recordBrokCodeProjectDeployment,
  updateBrokCodeProjectPreview,
  upsertBrokCodeProjectFile
} from '../project-store'

const workspaceId = 'workspace_test'
const userId = 'user_test'

let syncDir: string

describe('BrokCode project file store', () => {
  beforeEach(async () => {
    syncDir = await mkdtemp(path.join(tmpdir(), 'brokcode-projects-'))
    process.env.BROKCODE_PROJECT_STORAGE = 'file'
    process.env.BROKCODE_SYNC_DIR = syncDir
  })

  afterEach(async () => {
    delete process.env.BROKCODE_PROJECT_STORAGE
    delete process.env.BROKCODE_SYNC_DIR
    await rm(syncDir, { recursive: true, force: true })
  })

  it('creates unique slugs in fallback storage', async () => {
    const first = await createBrokCodeProject({
      workspaceId,
      userId,
      name: 'Demo App'
    })
    const second = await createBrokCodeProject({
      workspaceId,
      userId,
      name: 'Demo App'
    })

    expect(first.slug).toBe('demo-app')
    expect(second.slug).toBe('demo-app-2')
  })

  it('keeps local fallback workspace projects in file storage even when DATABASE_URL is set', async () => {
    const previousStorage = process.env.BROKCODE_PROJECT_STORAGE
    const previousDatabaseUrl = process.env.DATABASE_URL
    delete process.env.BROKCODE_PROJECT_STORAGE
    process.env.DATABASE_URL =
      previousDatabaseUrl ?? 'postgres://local-fallback-test'
    const localWorkspaceId = '00000000-0000-0000-0000-000000000000'

    try {
      const project = await createBrokCodeProject({
        workspaceId: localWorkspaceId,
        userId,
        name: 'Local Smoke App'
      })
      await upsertBrokCodeProjectFile({
        projectId: project.id,
        workspaceId: localWorkspaceId,
        path: 'index.html',
        content: '<h1>Local smoke app</h1>'
      })

      await expect(
        getBrokCodeProject({
          id: project.id,
          workspaceId: localWorkspaceId,
          userId
        })
      ).resolves.toMatchObject({ id: project.id })
      await expect(
        listBrokCodeProjectFiles({
          projectId: project.id,
          workspaceId: localWorkspaceId
        })
      ).resolves.toHaveLength(1)
    } finally {
      if (previousStorage === undefined) {
        delete process.env.BROKCODE_PROJECT_STORAGE
      } else {
        process.env.BROKCODE_PROJECT_STORAGE = previousStorage
      }
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl
      }
    }
  })

  it('tracks triggered deploys as deploying until a real URL is available', async () => {
    const project = await createBrokCodeProject({
      workspaceId,
      userId,
      name: 'Deploy App'
    })

    await recordBrokCodeProjectDeployment({
      projectId: project.id,
      workspaceId,
      userId,
      provider: 'railway',
      status: 'triggered'
    })

    const [deployingProject] = await listBrokCodeProjects({
      workspaceId,
      userId
    })
    expect(deployingProject?.status).toBe('deploying')
    expect(deployingProject?.previewUrl).toBeNull()

    await recordBrokCodeProjectDeployment({
      projectId: project.id,
      workspaceId,
      userId,
      provider: 'railway',
      status: 'deployed',
      url: 'https://demo.brok.fyi'
    })

    const [deployedProject] = await listBrokCodeProjects({
      workspaceId,
      userId
    })
    expect(deployedProject?.status).toBe('deployed')
    expect(deployedProject?.previewUrl).toBe('https://demo.brok.fyi')
  })

  it('rejects unsafe project file paths', async () => {
    const project = await createBrokCodeProject({
      workspaceId,
      userId,
      name: 'Files App'
    })

    await expect(
      upsertBrokCodeProjectFile({
        projectId: project.id,
        workspaceId,
        path: '../.env',
        content: 'SECRET=value'
      })
    ).rejects.toThrow('Invalid file path')
  })

  it('updates managed preview URLs without requiring a Railway deploy', async () => {
    const project = await createBrokCodeProject({
      workspaceId,
      userId,
      name: 'Preview App'
    })

    await updateBrokCodeProjectPreview({
      projectId: project.id,
      workspaceId,
      userId,
      previewUrl: 'https://www.brok.fyi/api/brokcode/previews/demo/index.html',
      metadata: {
        mode: 'managed_static',
        fileCount: 1
      }
    })

    const [updatedProject] = await listBrokCodeProjects({
      workspaceId,
      userId
    })
    expect(updatedProject?.status).toBe('preview_ready')
    expect(updatedProject?.previewUrl).toBe(
      'https://www.brok.fyi/api/brokcode/previews/demo/index.html'
    )
    expect(updatedProject?.metadata?.preview).toMatchObject({
      mode: 'managed_static',
      fileCount: 1
    })
  })

  it('keeps managed preview and public deployment URLs distinct', async () => {
    const project = await createBrokCodeProject({
      workspaceId,
      userId,
      name: 'Published App'
    })

    await updateBrokCodeProjectPreview({
      projectId: project.id,
      workspaceId,
      userId,
      previewUrl:
        'https://www.brok.fyi/api/brokcode/previews/published/index.html',
      deploymentUrl:
        'https://www.brok.fyi/brokcode/apps/published-app--published/index.html'
    })
    await recordBrokCodeProjectDeployment({
      projectId: project.id,
      workspaceId,
      userId,
      provider: 'managed_preview',
      status: 'deployed',
      url: 'https://www.brok.fyi/brokcode/apps/published-app--published/index.html',
      metadata: {
        previewUrl:
          'https://www.brok.fyi/api/brokcode/previews/published/index.html'
      }
    })

    const [publishedProject] = await listBrokCodeProjects({
      workspaceId,
      userId
    })
    expect(publishedProject?.status).toBe('deployed')
    expect(publishedProject?.deploymentUrl).toBe(
      'https://www.brok.fyi/brokcode/apps/published-app--published/index.html'
    )
    expect(publishedProject?.previewUrl).toBe(
      'https://www.brok.fyi/api/brokcode/previews/published/index.html'
    )
  })

  it('resolves public deployed app handles by slug or username', async () => {
    const project = await createBrokCodeProject({
      workspaceId,
      userId,
      name: 'Customer Portal',
      username: 'Acme Studio'
    })

    await updateBrokCodeProjectPreview({
      projectId: project.id,
      workspaceId,
      userId,
      previewUrl: 'https://www.brok.fyi/api/brokcode/previews/demo/index.html',
      deploymentUrl: 'https://www.brok.fyi/brokcode/apps/acme-studio/',
      status: 'deployed'
    })

    await expect(
      getBrokCodeProjectByHandle({ handle: 'customer-portal' })
    ).resolves.toMatchObject({ id: project.id })
    await expect(
      getBrokCodeProjectByHandle({ handle: 'Acme Studio' })
    ).resolves.toMatchObject({ id: project.id })
    await expect(
      getBrokCodeProjectByHandle({
        handle: `acme-studio--${project.id}`
      })
    ).resolves.toMatchObject({ id: project.id })
  })
})
