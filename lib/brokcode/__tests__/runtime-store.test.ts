import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createBrokCodeRuntimeSpec } from '../runtime/contract'
import {
  createBrokCodeRuntimeSandbox,
  getLatestBrokCodeRuntimeSandbox,
  listBrokCodeRuntimeSandboxes,
  updateBrokCodeRuntimeSandbox
} from '../runtime/store'

const projectId = '00000000-0000-0000-0000-000000000101'
const workspaceId = '00000000-0000-0000-0000-000000000102'
const userId = 'user-runtime-test'

let syncDir: string

describe('BrokCode runtime file store', () => {
  beforeEach(async () => {
    syncDir = await mkdtemp(path.join(tmpdir(), 'brokcode-runtimes-'))
    process.env.BROKCODE_PROJECT_STORAGE = 'file'
    process.env.BROKCODE_SYNC_DIR = syncDir
  })

  afterEach(async () => {
    delete process.env.BROKCODE_PROJECT_STORAGE
    delete process.env.BROKCODE_SYNC_DIR
    await rm(syncDir, { recursive: true, force: true })
  })

  it('persists runtime metadata and returns the latest project runtime', async () => {
    const spec = createBrokCodeRuntimeSpec({
      projectId,
      workspaceId,
      userId,
      versionId: 'v1',
      sessionId: 'session-1',
      context: {
        institutionId: 'institution-1',
        courseId: 'course-1',
        sectionId: 'section-1',
        assignmentId: 'assignment-1'
      },
      files: [
        {
          path: 'index.html',
          content: '<main>Student project</main>'
        }
      ]
    })

    const runtime = await createBrokCodeRuntimeSandbox({ spec })
    expect(runtime).toMatchObject({
      projectId,
      workspaceId,
      userId,
      versionId: 'v1',
      sessionId: 'session-1',
      institutionId: 'institution-1',
      courseId: 'course-1',
      appType: 'static_html',
      status: 'preparing'
    })

    await updateBrokCodeRuntimeSandbox({
      id: runtime.id,
      workspaceId,
      userId,
      status: 'healthy',
      health: {
        ok: true,
        checkedAt: '2026-05-24T00:00:00.000Z',
        url: 'http://127.0.0.1:4173'
      }
    })

    const latest = await getLatestBrokCodeRuntimeSandbox({
      projectId,
      workspaceId,
      userId
    })
    expect(latest?.status).toBe('healthy')
    expect(latest?.health).toMatchObject({ ok: true })

    const runtimes = await listBrokCodeRuntimeSandboxes({
      projectId,
      workspaceId,
      userId
    })
    expect(runtimes).toHaveLength(1)
  })
})
