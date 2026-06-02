import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

process.env.BROKCODE_PROJECT_STORAGE = 'file'
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://brok:brok@127.0.0.1:5432/brok'

const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'brokcode-runtime-'))
const syncRoot = await mkdtemp(path.join(tmpdir(), 'brokcode-sync-'))
process.env.BROKCODE_RUNTIME_WORKSPACE_DIR = runtimeRoot
process.env.BROKCODE_SYNC_DIR = syncRoot

const { createBrokCodeRuntimeSpec } =
  await import('../lib/brokcode/runtime/contract')
const {
  appendBrokCodeRuntimeBrowserEvent,
  getBrokCodeRuntimeDiagnostics,
  getBrokCodeRuntimeProcess,
  startBrokCodeRuntimeProcess
} = await import('../lib/brokcode/runtime/process-manager')
const { createBrokCodeRuntimeSandbox, refreshBrokCodeRuntimeSandbox } =
  await import('../lib/brokcode/runtime/store')
const { materializeBrokCodeRuntimeWorkspace } =
  await import('../lib/brokcode/runtime/workspace')

type RuntimeFile = {
  path: string
  content: string
}

const projectId = `runtime-smoke-${randomUUID()}`
const workspaceId = 'runtime-smoke-workspace'
const userId = 'runtime-smoke-user'
const versionId = 'live-vite'

function appFile(label: string): RuntimeFile {
  return {
    path: 'src/App.tsx',
    content: [
      "import React from 'react'",
      '',
      'export function App() {',
      '  return (',
      '    <main style={{ fontFamily: "system-ui", padding: 32 }}>',
      `      <h1>${label}</h1>`,
      '      <p>BrokCode live runtime smoke</p>',
      '    </main>',
      '  )',
      '}'
    ].join('\n')
  }
}

function packageFile(): RuntimeFile {
  return {
    path: 'package.json',
    content: JSON.stringify(
      {
        private: true,
        type: 'module',
        scripts: {
          dev: 'vite --host 127.0.0.1',
          build: 'vite build'
        },
        dependencies: {
          '@vitejs/plugin-react': '^4.4.1',
          vite: '^6.3.5',
          react: '^19.2.6',
          'react-dom': '^19.2.6',
          typescript: '^5.8.3'
        },
        devDependencies: {}
      },
      null,
      2
    )
  }
}

function createFiles(label: string) {
  return [packageFile(), appFile(label)]
}

async function materialize(label: string) {
  const files = createFiles(label)
  const spec = createBrokCodeRuntimeSpec({
    projectId,
    workspaceId,
    userId,
    versionId,
    files
  })
  const materialized = await materializeBrokCodeRuntimeWorkspace({
    spec,
    files,
    projectName: 'runtime-smoke-app'
  })

  return {
    spec: {
      ...spec,
      appType: materialized.manifest.appType,
      packageManager: materialized.manifest.packageManager,
      workspacePath: materialized.workspacePath,
      installCommand: materialized.manifest.installCommand,
      devCommand: materialized.manifest.devCommand,
      buildCommand: materialized.manifest.buildCommand,
      metadata: {
        ...spec.metadata,
        workspace: materialized.manifest
      }
    },
    manifest: materialized.manifest
  }
}

async function stopRuntime(runtimeId: string) {
  const entry = getBrokCodeRuntimeProcess(runtimeId)
  if (!entry?.process) return

  await new Promise<void>(resolve => {
    const timer = setTimeout(resolve, 2000)
    entry.process?.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    entry.process?.kill()
  })
}

async function main() {
  const first = await materialize('Runtime smoke v1')
  const runtime = await createBrokCodeRuntimeSandbox({ spec: first.spec })
  const entry = await startBrokCodeRuntimeProcess({
    runtime,
    manifest: first.manifest
  })

  if (!entry || entry.status !== 'ready' || !entry.url) {
    throw new Error(
      [
        'Runtime did not start a ready Vite process.',
        `appType=${first.manifest.appType}`,
        `packageManager=${first.manifest.packageManager}`,
        `workspacePath=${first.manifest.workspacePath}`,
        ...(entry?.logs ?? []).map(log => `${log.source}: ${log.message}`)
      ].join('\n')
    )
  }

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
  const browserEvents: string[] = []
  page.on('console', message =>
    browserEvents.push(`${message.type()}: ${message.text()}`)
  )
  page.on('pageerror', error =>
    browserEvents.push(`pageerror: ${error.message}`)
  )

  try {
    await page.goto(entry.url, { waitUntil: 'networkidle' })
    try {
      await page.getByRole('heading', { name: 'Runtime smoke v1' }).waitFor()
    } catch (error) {
      const bodyText = await page
        .locator('body')
        .innerText()
        .catch(() => '')
      throw new Error(
        [
          error instanceof Error ? error.message : String(error),
          `body=${bodyText}`,
          ...browserEvents.slice(-20)
        ].join('\n')
      )
    }

    const second = await materialize('Runtime smoke v2 hot reload')
    const latestRuntime = await refreshBrokCodeRuntimeSandbox(runtime)
    if (!latestRuntime) throw new Error('Runtime disappeared from the store.')

    const refreshedEntry = await startBrokCodeRuntimeProcess({
      runtime: latestRuntime,
      manifest: second.manifest
    })

    if (!refreshedEntry || refreshedEntry.port !== entry.port) {
      throw new Error('Runtime process was not reused for a source-only edit.')
    }

    try {
      await page
        .getByRole('heading', { name: 'Runtime smoke v2 hot reload' })
        .waitFor()
    } catch (error) {
      const bodyText = await page
        .locator('body')
        .innerText()
        .catch(() => '')
      throw new Error(
        [
          error instanceof Error ? error.message : String(error),
          `body=${bodyText}`,
          ...browserEvents.slice(-20)
        ].join('\n')
      )
    }

    const refreshedRuntime = await refreshBrokCodeRuntimeSandbox(runtime)
    if (!refreshedRuntime) {
      throw new Error('Runtime disappeared after hot reload.')
    }
    const livePreview = refreshedRuntime?.metadata?.livePreview as
      | Record<string, unknown>
      | undefined

    if (livePreview?.hotReload !== true) {
      throw new Error('Runtime metadata did not record a hot reload update.')
    }

    const capturedLogs = await appendBrokCodeRuntimeBrowserEvent({
      runtime: refreshedRuntime,
      event: {
        level: 'error',
        message: 'Intentional broken preview smoke error',
        file: 'src/App.tsx',
        line: 7,
        column: 13,
        stack: 'Error: Intentional broken preview smoke error'
      }
    })
    const diagnostics = getBrokCodeRuntimeDiagnostics(refreshedRuntime)
    const lastError = diagnostics.lastError
    if (
      capturedLogs.length === 0 ||
      lastError?.source !== 'browser' ||
      lastError.message !== 'Intentional broken preview smoke error' ||
      lastError.file !== 'src/App.tsx' ||
      lastError.line !== 7 ||
      lastError.column !== 13
    ) {
      throw new Error(
        'Runtime diagnostics did not capture browser error context.'
      )
    }

    console.log(
      `brokcode runtime ok url=${entry.url} port=${entry.port} runtime=${runtime.id}`
    )
  } finally {
    await browser.close()
    await stopRuntime(runtime.id)
  }
}

async function cleanup() {
  await rm(runtimeRoot, { recursive: true, force: true })
  await rm(syncRoot, { recursive: true, force: true })
}

try {
  await main()
  await cleanup()
  process.exit(0)
} catch (error) {
  await cleanup()
  console.error(error)
  process.exit(1)
}
