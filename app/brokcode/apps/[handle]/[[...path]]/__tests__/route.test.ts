import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createBrokCodeDeploymentFileSnapshot,
  createBrokCodeProject,
  recordBrokCodeProjectDeployment,
  upsertBrokCodeProjectFile
} from '@/lib/brokcode/project-store'

import { GET } from '../route'

const workspaceId = 'workspace_test'
const userId = 'user_test'

let syncDir: string

function routeParams(handle: string, filePath = 'index.html') {
  return {
    params: Promise.resolve({
      handle,
      path: [filePath]
    })
  }
}

describe('public BrokCode app route', () => {
  beforeEach(async () => {
    syncDir = await mkdtemp(path.join(tmpdir(), 'brokcode-public-app-'))
    process.env.BROKCODE_PROJECT_STORAGE = 'file'
    process.env.BROKCODE_SYNC_DIR = syncDir
  })

  afterEach(async () => {
    delete process.env.BROKCODE_PROJECT_STORAGE
    delete process.env.BROKCODE_SYNC_DIR
    await rm(syncDir, { recursive: true, force: true })
  })

  it('serves the latest deployed snapshot instead of mutable current project files', async () => {
    const project = await createBrokCodeProject({
      workspaceId,
      userId,
      name: 'Published Snapshot'
    })
    const publishedHtml =
      '<!doctype html><html><head><title>Published</title><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><main><h1>Published CRM</h1><p>This is the explicitly deployed app.</p><button>Open</button></main></body></html>'
    const draftHtml =
      '<!doctype html><html><head><title>Draft</title><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><main><h1>Draft CRM</h1><p>This edit has not been republished.</p><button>Open</button></main></body></html>'

    await upsertBrokCodeProjectFile({
      projectId: project.id,
      workspaceId,
      path: 'index.html',
      content: publishedHtml,
      language: 'html'
    })
    await recordBrokCodeProjectDeployment({
      projectId: project.id,
      workspaceId,
      userId,
      provider: 'managed_preview',
      status: 'deployed',
      url: `https://www.brok.fyi/brokcode/apps/${project.slug}--${project.id}/index.html`,
      metadata: {
        fileSnapshot: createBrokCodeDeploymentFileSnapshot([
          {
            path: 'index.html',
            content: publishedHtml,
            language: 'html'
          }
        ])
      }
    })
    await upsertBrokCodeProjectFile({
      projectId: project.id,
      workspaceId,
      path: 'index.html',
      content: draftHtml,
      language: 'html'
    })

    const response = await GET(
      new Request(
        `https://www.brok.fyi/brokcode/apps/${project.slug}--${project.id}/index.html`
      ),
      routeParams(`${project.slug}--${project.id}`)
    )
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toContain('Published CRM')
    expect(body).not.toContain('Draft CRM')
    expect(response.headers.get('X-BrokCode-Project')).toBe(project.id)
  })

  it('does not serve mutable current files when the deployed record has no snapshot', async () => {
    const project = await createBrokCodeProject({
      workspaceId,
      userId,
      name: 'Legacy Deploy'
    })
    const draftHtml =
      '<!doctype html><html><head><title>Draft</title><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><main><h1>Mutable draft</h1><p>This file was never snapshotted as a deployment.</p><button>Open</button></main></body></html>'

    await upsertBrokCodeProjectFile({
      projectId: project.id,
      workspaceId,
      path: 'index.html',
      content: draftHtml,
      language: 'html'
    })
    await recordBrokCodeProjectDeployment({
      projectId: project.id,
      workspaceId,
      userId,
      provider: 'managed_preview',
      status: 'deployed',
      url: `https://www.brok.fyi/brokcode/apps/${project.slug}--${project.id}/index.html`,
      metadata: {}
    })

    const response = await GET(
      new Request(
        `https://www.brok.fyi/brokcode/apps/${project.slug}--${project.id}/index.html`
      ),
      routeParams(`${project.slug}--${project.id}`)
    )
    const body = await response.text()

    expect(response.status).toBe(404)
    expect(body).toContain('no published snapshot')
    expect(body).not.toContain('Mutable draft')
  })
})
