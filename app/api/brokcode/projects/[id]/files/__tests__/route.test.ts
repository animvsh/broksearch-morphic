import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clearBrokCodeProjectPreview: vi.fn(),
  enforceBrokCodeAccountOwnership: vi.fn(),
  getBrokCodeProject: vi.fn(),
  listBrokCodeProjectFiles: vi.fn(),
  materializeBrokCodeRuntimeWorkspace: vi.fn(),
  renameBrokCodeProjectFile: vi.fn(),
  resolveBrokCodeRequestAuth: vi.fn(),
  updateBrokCodeProjectPreview: vi.fn(),
  upsertBrokCodeProjectFile: vi.fn()
}))

vi.mock('@/lib/brokcode/account-guard', () => ({
  enforceBrokCodeAccountOwnership: mocks.enforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth: mocks.resolveBrokCodeRequestAuth
}))

vi.mock('@/lib/brokcode/project-store', () => ({
  clearBrokCodeProjectPreview: mocks.clearBrokCodeProjectPreview,
  deleteBrokCodeProjectFile: vi.fn(),
  getBrokCodeProject: mocks.getBrokCodeProject,
  listBrokCodeProjectFiles: mocks.listBrokCodeProjectFiles,
  renameBrokCodeProjectFile: mocks.renameBrokCodeProjectFile,
  updateBrokCodeProjectPreview: mocks.updateBrokCodeProjectPreview,
  upsertBrokCodeProjectFile: mocks.upsertBrokCodeProjectFile
}))

vi.mock('@/lib/brokcode/runtime/workspace', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/brokcode/runtime/workspace')
  >('@/lib/brokcode/runtime/workspace')
  return {
    ...actual,
    materializeBrokCodeRuntimeWorkspace:
      mocks.materializeBrokCodeRuntimeWorkspace
  }
})

import { POST, PUT } from '../route'

const authResult = {
  success: true,
  workspace: { id: 'workspace-1' },
  apiKey: { userId: 'user-1' }
}

const project = {
  id: 'project-1',
  workspaceId: 'workspace-1',
  userId: 'user-1',
  name: 'CRM',
  slug: 'crm',
  status: 'draft',
  previewUrl: null,
  deploymentUrl: null,
  metadata: {}
}

const htmlFile = {
  id: 'file-html',
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  path: 'index.html',
  content: '<main>Saved CRM</main>',
  language: 'html'
}

const cssFile = {
  id: 'file-css',
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  path: 'styles.css',
  content: 'body { color: black; }',
  language: 'css'
}

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/brokcode/projects/project-1/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

function routeParams() {
  return { params: Promise.resolve({ id: 'project-1' }) }
}

describe('BrokCode project files route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveBrokCodeRequestAuth.mockResolvedValue({ authResult })
    mocks.enforceBrokCodeAccountOwnership.mockResolvedValue(null)
    mocks.getBrokCodeProject.mockResolvedValue(project)
    mocks.listBrokCodeProjectFiles.mockResolvedValue([htmlFile, cssFile])
    mocks.upsertBrokCodeProjectFile.mockResolvedValue(htmlFile)
    mocks.materializeBrokCodeRuntimeWorkspace.mockResolvedValue({
      manifest: {
        appType: 'static',
        files: [{ path: 'index.html' }]
      }
    })
    mocks.updateBrokCodeProjectPreview.mockResolvedValue({
      ...project,
      status: 'preview_ready',
      previewUrl: 'http://localhost/api/brokcode/previews/project-1/index.html',
      metadata: {
        preview: {
          refreshReason: 'file_save'
        }
      }
    })
    mocks.clearBrokCodeProjectPreview.mockResolvedValue({
      ...project,
      status: 'draft',
      previewUrl: null,
      metadata: {
        preview: {
          unavailableReason: 'missing_renderable_entry'
        }
      }
    })
  })

  it('refreshes managed preview metadata after saving a renderable file', async () => {
    const response = await PUT(
      request({
        path: 'index.html',
        content: '<main>Saved CRM</main>',
        language: 'html'
      }),
      routeParams()
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.upsertBrokCodeProjectFile).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        path: 'index.html',
        content: expect.stringContaining('<main>Saved CRM</main>')
      })
    )
    expect(mocks.updateBrokCodeProjectPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        previewUrl:
          'http://localhost/api/brokcode/previews/project-1/index.html',
        metadata: expect.objectContaining({
          mode: 'managed_live_preview',
          fileCount: 2,
          hotReload: true,
          refreshReason: 'file_save'
        })
      })
    )
    expect(body).toMatchObject({
      previewUrl: 'http://localhost/api/brokcode/previews/project-1/index.html',
      allFiles: [
        { path: 'index.html', content: '<main>Saved CRM</main>' },
        { path: 'styles.css' }
      ],
      project: {
        status: 'preview_ready'
      }
    })
  })

  it('refreshes managed preview metadata after batched file operations', async () => {
    mocks.updateBrokCodeProjectPreview.mockResolvedValue({
      ...project,
      status: 'preview_ready',
      previewUrl: 'http://localhost/api/brokcode/previews/project-1/index.html',
      metadata: {
        preview: {
          refreshReason: 'file_operations'
        }
      }
    })

    const response = await POST(
      request({
        operations: [
          {
            type: 'replace_file',
            path: 'index.html',
            content: '<main>Batch edit</main>'
          }
        ]
      }),
      routeParams()
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.updateBrokCodeProjectPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          refreshReason: 'file_operations'
        })
      })
    )
    expect(body).toMatchObject({
      previewUrl: 'http://localhost/api/brokcode/previews/project-1/index.html',
      changes: [expect.objectContaining({ type: 'replace_file' })],
      files: [
        { path: 'index.html', content: '<main>Saved CRM</main>' },
        { path: 'styles.css' }
      ]
    })
  })

  it('clears stale managed preview metadata when file operations remove the entrypoint', async () => {
    mocks.listBrokCodeProjectFiles
      .mockResolvedValueOnce([htmlFile, cssFile])
      .mockResolvedValueOnce([cssFile])

    const response = await POST(
      request({
        operations: [
          {
            type: 'delete_file',
            path: 'index.html'
          }
        ]
      }),
      routeParams()
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.updateBrokCodeProjectPreview).not.toHaveBeenCalled()
    expect(mocks.clearBrokCodeProjectPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        metadata: expect.objectContaining({
          refreshReason: 'file_operations',
          unavailableReason: 'missing_renderable_entry',
          hotReload: false
        })
      })
    )
    expect(body).toMatchObject({
      previewUrl: null,
      project: {
        status: 'draft',
        previewUrl: null,
        metadata: {
          preview: {
            unavailableReason: 'missing_renderable_entry'
          }
        }
      }
    })
  })
})
