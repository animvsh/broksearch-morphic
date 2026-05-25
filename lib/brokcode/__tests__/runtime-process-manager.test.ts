import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createBrokCodeRuntimeSpec } from '../runtime/contract'
import {
  createRuntimeLogs,
  persistBrokCodeRuntimeProcessExit,
  redactBrokCodeRuntimeLog
} from '../runtime/process-manager'
import {
  createBrokCodeRuntimeSandbox,
  getLatestBrokCodeRuntimeSandbox
} from '../runtime/store'

const projectId = '00000000-0000-0000-0000-000000000301'
const workspaceId = '00000000-0000-0000-0000-000000000302'
const userId = 'user-runtime-process-test'

let syncDir: string

describe('BrokCode runtime process diagnostics', () => {
  beforeEach(async () => {
    syncDir = await mkdtemp(path.join(tmpdir(), 'brokcode-process-'))
    process.env.BROKCODE_PROJECT_STORAGE = 'file'
    process.env.BROKCODE_SYNC_DIR = syncDir
  })

  afterEach(async () => {
    delete process.env.BROKCODE_PROJECT_STORAGE
    delete process.env.BROKCODE_SYNC_DIR
    await rm(syncDir, { recursive: true, force: true })
  })

  it('redacts secrets from runtime logs', () => {
    expect(
      redactBrokCodeRuntimeLog(
        'OPENAI_API_KEY=sk-test token: abc123 password=hunter2'
      )
    ).toBe('OPENAI_API_KEY=[redacted] token=[redacted] password=[redacted]')
  })

  it('caps noisy log chunks and preserves clickable error context', () => {
    const logs = createRuntimeLogs({
      level: 'error',
      source: 'browser',
      message: `${'x'.repeat(2100)}\n${Array.from({ length: 60 }, (_, index) => `line ${index}`).join('\n')}`,
      file: '/src/App.tsx',
      line: 42,
      column: 7,
      stack: `Authorization: bearer-token\n${'s'.repeat(4200)}`
    })

    expect(logs).toHaveLength(40)
    expect(logs.at(-1)).toMatchObject({
      level: 'error',
      source: 'browser',
      file: '/src/App.tsx',
      line: 42,
      column: 7
    })
    expect(logs[0].message.length).toBeLessThanOrEqual(2003)
    expect(logs.at(-1)?.stack).toContain('Authorization=[redacted]')
    expect(logs.at(-1)?.stack?.length ?? 0).toBeLessThanOrEqual(4000)
  })

  it('persists terminal process status, logs, and live preview metadata', async () => {
    const spec = createBrokCodeRuntimeSpec({
      projectId,
      workspaceId,
      userId,
      files: [{ path: 'src/App.tsx', content: 'export function App() {}' }]
    })
    const runtime = await createBrokCodeRuntimeSandbox({ spec })
    const startedAt = new Date('2026-05-25T00:00:00.000Z')

    await persistBrokCodeRuntimeProcessExit({
      runtime,
      code: 1,
      entry: {
        runtimeId: runtime.id,
        port: 5173,
        url: 'http://127.0.0.1:5173',
        process: null,
        status: 'ready',
        logs: createRuntimeLogs({
          level: 'info',
          source: 'dev-server',
          message: 'ready'
        }),
        startedAt
      }
    })

    const latest = await getLatestBrokCodeRuntimeSandbox({
      projectId,
      workspaceId,
      userId
    })

    expect(latest?.status).toBe('crashed')
    expect(latest?.health).toMatchObject({
      ok: false,
      url: 'http://127.0.0.1:5173'
    })
    expect(latest?.logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'error',
          message: 'Runtime exited 1.'
        })
      ])
    )
    expect(latest?.metadata).toMatchObject({
      livePreview: {
        status: 'crashed',
        port: 5173,
        url: 'http://127.0.0.1:5173',
        proxyPath: `/api/brokcode/runtime/${runtime.id}/`,
        startedAt: startedAt.toISOString(),
        exitCode: 1,
        signal: null
      }
    })
  })
})
