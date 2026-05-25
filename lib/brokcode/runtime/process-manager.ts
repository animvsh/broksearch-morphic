import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

import {
  BrokCodeRuntimeSandbox,
  updateBrokCodeRuntimeSandbox
} from '@/lib/brokcode/runtime/store'
import { BrokCodeRuntimeWorkspaceManifest } from '@/lib/brokcode/runtime/workspace'

export type RuntimeProcess = {
  runtimeId: string
  port: number
  url: string
  process: ReturnType<typeof spawn> | null
  status: 'starting' | 'ready' | 'crashed' | 'stopped'
  logs: BrokCodeRuntimeLog[]
  startedAt: Date
}

export type BrokCodeRuntimeProcessReuseDecision = {
  action: 'reuse' | 'install' | 'restart'
  reason: string
}

export type BrokCodeRuntimeLog = {
  level: 'info' | 'warn' | 'error'
  source: 'install' | 'dev-server' | 'browser' | 'system'
  message: string
  at: string
  command?: string
  file?: string
  line?: number
  column?: number
  stack?: string
}

export type BrokCodeRuntimeBrowserEvent = {
  level?: unknown
  message?: unknown
  stack?: unknown
  source?: unknown
  file?: unknown
  line?: unknown
  column?: unknown
}

const runtimeProcesses = new Map<string, RuntimeProcess>()
const MAX_RUNTIME_LOGS = 250
const MAX_RUNTIME_LOG_MESSAGE_LENGTH = 2000
const SECRET_VALUE_PATTERN =
  /\b(api[_-]?key|token|secret|password|authorization|bearer)\b\s*[:=]\s*["']?[^"'\s,;]+/gi
const ENV_SECRET_PATTERN =
  /\b[A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*=["']?[^"'\s,;]+/g
const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g

function getRuntimeProcesses() {
  const globalState = globalThis as typeof globalThis & {
    __brokCodeRuntimeProcesses?: Map<string, RuntimeProcess>
  }
  if (!globalState.__brokCodeRuntimeProcesses) {
    globalState.__brokCodeRuntimeProcesses = runtimeProcesses
  }
  return globalState.__brokCodeRuntimeProcesses
}

function appendLog(
  entry: RuntimeProcess,
  level: BrokCodeRuntimeLog['level'],
  message: string,
  options: Partial<Omit<BrokCodeRuntimeLog, 'level' | 'message' | 'at'>> = {}
) {
  const logs = createRuntimeLogs({
    level,
    message,
    ...options
  })
  entry.logs = [...entry.logs, ...logs].slice(-MAX_RUNTIME_LOGS)
}

export function redactBrokCodeRuntimeLog(value: string) {
  return value
    .replace(ANSI_PATTERN, '')
    .replace(SECRET_VALUE_PATTERN, '$1=[redacted]')
    .replace(ENV_SECRET_PATTERN, match => {
      const [name] = match.split('=')
      return `${name}=[redacted]`
    })
}

export function createRuntimeLogs({
  level,
  message,
  source,
  command,
  file,
  line: lineNumber,
  column,
  stack
}: {
  level: BrokCodeRuntimeLog['level']
  message: string
  source?: BrokCodeRuntimeLog['source']
  command?: string
  file?: string
  line?: number
  column?: number
  stack?: string
}) {
  const sanitized = redactBrokCodeRuntimeLog(message)
  const lines = sanitized
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean)
    .slice(-40)

  const at = new Date().toISOString()
  return (lines.length > 0 ? lines : ['']).map(line => ({
    level,
    source: source ?? 'system',
    message:
      line.length > MAX_RUNTIME_LOG_MESSAGE_LENGTH
        ? `${line.slice(0, MAX_RUNTIME_LOG_MESSAGE_LENGTH)}...`
        : line,
    at,
    ...(command ? { command: redactBrokCodeRuntimeLog(command) } : {}),
    ...(file ? { file: redactBrokCodeRuntimeLog(file) } : {}),
    ...(typeof lineNumber === 'number' ? { line: lineNumber } : {}),
    ...(typeof column === 'number' ? { column } : {}),
    ...(stack ? { stack: redactBrokCodeRuntimeLog(stack).slice(0, 4000) } : {})
  }))
}

async function findFreePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (address && typeof address === 'object') resolve(address.port)
        else reject(new Error('Could not reserve runtime port.'))
      })
    })
  })
}

async function waitForRuntime(url: string) {
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: 'no-store' })
      if (response.status < 500) return true
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 750))
  }
  return false
}

function commandFor({
  manifest,
  port
}: {
  manifest: BrokCodeRuntimeWorkspaceManifest
  port: number
}) {
  if (manifest.appType === 'vite_react') {
    return {
      command: 'bun',
      args: ['x', 'vite', '--host', '127.0.0.1', '--port', String(port)]
    }
  }

  if (manifest.appType === 'nextjs') {
    return {
      command: 'bun',
      args: ['x', 'next', 'dev', '-H', '127.0.0.1', '-p', String(port)]
    }
  }

  return null
}

function manifestFileHash({
  manifest,
  filePath
}: {
  manifest:
    | Pick<BrokCodeRuntimeWorkspaceManifest, 'files'>
    | Partial<BrokCodeRuntimeWorkspaceManifest>
    | null
    | undefined
  filePath: string
}) {
  const files = Array.isArray(manifest?.files) ? manifest.files : []
  return files.find(file => file.path === filePath)?.sha256 ?? null
}

function workspaceManifestFromMetadata(
  metadata: Record<string, unknown> | null | undefined
) {
  const workspace = metadata?.workspace
  if (!workspace || typeof workspace !== 'object') return null
  return workspace as Partial<BrokCodeRuntimeWorkspaceManifest>
}

export function getBrokCodeRuntimeProcessReuseDecision({
  runtime,
  manifest
}: {
  runtime: Pick<
    BrokCodeRuntimeSandbox,
    'appType' | 'packageManager' | 'workspacePath' | 'devCommand' | 'metadata'
  >
  manifest: BrokCodeRuntimeWorkspaceManifest
}): BrokCodeRuntimeProcessReuseDecision {
  const previousManifest = workspaceManifestFromMetadata(runtime.metadata)

  if (
    runtime.appType !== manifest.appType ||
    runtime.packageManager !== manifest.packageManager ||
    runtime.workspacePath !== manifest.workspacePath ||
    runtime.devCommand !== manifest.devCommand
  ) {
    return {
      action: 'restart',
      reason: 'Runtime contract changed.'
    }
  }

  if (!previousManifest) {
    return {
      action: 'reuse',
      reason: 'Runtime process is already attached.'
    }
  }

  const dependencyFiles = [
    'package.json',
    'bun.lock',
    'bun.lockb',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock'
  ]
  const dependencyFileChanged = dependencyFiles.some(
    filePath =>
      manifestFileHash({ manifest: previousManifest, filePath }) !==
      manifestFileHash({ manifest, filePath })
  )

  if (dependencyFileChanged && manifest.packageManager !== 'none') {
    return {
      action: 'install',
      reason: 'Dependency manifest changed.'
    }
  }

  return {
    action: 'reuse',
    reason: 'Workspace files changed; live preview can hot reload.'
  }
}

async function installDependencies({
  manifest,
  workspacePath,
  entry
}: {
  manifest: BrokCodeRuntimeWorkspaceManifest
  workspacePath: string
  entry: RuntimeProcess
}) {
  if (manifest.packageManager === 'none') return

  appendLog(entry, 'info', 'Installing dependencies with bun install.', {
    source: 'install',
    command: 'bun install'
  })
  await new Promise<void>((resolve, reject) => {
    const child = spawn('bun', ['install'], {
      cwd: workspacePath,
      env: {
        ...process.env,
        CI: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stderr = ''
    child.stdout.on('data', chunk => {
      appendLog(entry, 'info', String(chunk), {
        source: 'install',
        command: 'bun install'
      })
    })
    child.stderr.on('data', chunk => {
      stderr += String(chunk)
      appendLog(entry, 'error', String(chunk), {
        source: 'install',
        command: 'bun install'
      })
    })
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `bun install exited ${code}`))
    })
  })
}

async function markRuntimeProcessUnavailable({
  runtime,
  entry
}: {
  runtime: BrokCodeRuntimeSandbox
  entry: RuntimeProcess
}) {
  entry.status = 'crashed'
  appendLog(entry, 'error', 'Runtime process stopped responding.', {
    source: 'dev-server'
  })
  getRuntimeProcesses().delete(runtime.id)
  await updateBrokCodeRuntimeSandbox({
    id: runtime.id,
    workspaceId: runtime.workspaceId,
    userId: runtime.userId,
    status: 'crashed',
    logs: entry.logs,
    health: {
      ok: false,
      checkedAt: new Date().toISOString(),
      url: entry.url,
      message: 'Runtime process stopped responding.'
    },
    metadata: {
      ...(runtime.metadata ?? {}),
      livePreview: {
        status: 'crashed',
        port: entry.port,
        url: entry.url,
        proxyPath: `/api/brokcode/runtime/${encodeURIComponent(runtime.id)}/`,
        startedAt: entry.startedAt.toISOString(),
        stoppedAt: new Date().toISOString()
      }
    }
  })
}

async function stopRuntimeProcessForRestart({
  entry,
  reason
}: {
  entry: RuntimeProcess
  reason: string
}) {
  appendLog(entry, 'info', `Restarting runtime: ${reason}`, {
    source: 'system'
  })
  entry.status = 'stopped'
  if (entry.process) {
    entry.process.removeAllListeners('exit')
    entry.process.kill()
  }
  getRuntimeProcesses().delete(entry.runtimeId)
}

async function refreshExistingRuntimeProcess({
  runtime,
  entry,
  manifest,
  decision
}: {
  runtime: BrokCodeRuntimeSandbox
  entry: RuntimeProcess
  manifest: BrokCodeRuntimeWorkspaceManifest
  decision: BrokCodeRuntimeProcessReuseDecision
}) {
  if (decision.action === 'install') {
    await installDependencies({
      manifest,
      workspacePath: manifest.workspacePath,
      entry
    })
  }

  appendLog(entry, 'info', `Applied hot reload update. ${decision.reason}`, {
    source: 'system'
  })
  entry.status = 'ready'
  await updateBrokCodeRuntimeSandbox({
    id: runtime.id,
    workspaceId: runtime.workspaceId,
    userId: runtime.userId,
    status: 'healthy',
    logs: entry.logs,
    health: {
      ok: true,
      checkedAt: new Date().toISOString(),
      url: entry.url,
      message: decision.reason
    },
    metadata: {
      ...(runtime.metadata ?? {}),
      workspace: manifest,
      livePreview: {
        status: 'ready',
        port: entry.port,
        url: entry.url,
        proxyPath: `/api/brokcode/runtime/${encodeURIComponent(runtime.id)}/`,
        startedAt: entry.startedAt.toISOString(),
        refreshedAt: new Date().toISOString(),
        materializedAt: manifest.materializedAt,
        hotReload: true,
        refreshReason: decision.reason
      }
    }
  })

  return entry
}

export function getBrokCodeRuntimeProcess(runtimeId: string) {
  return getRuntimeProcesses().get(runtimeId) ?? null
}

export function getBrokCodeRuntimeDiagnostics(runtime: BrokCodeRuntimeSandbox) {
  const processEntry = getBrokCodeRuntimeProcess(runtime.id)
  const logs = (
    processEntry?.logs.length ? processEntry.logs : (runtime.logs ?? [])
  ) as BrokCodeRuntimeLog[]
  const normalizedLogs = logs.slice(-MAX_RUNTIME_LOGS)
  const lastError =
    [...normalizedLogs].reverse().find(log => log.level === 'error') ?? null

  return {
    runtimeId: runtime.id,
    status: processEntry?.status ?? runtime.status,
    process: processEntry
      ? {
          port: processEntry.port,
          url: processEntry.url,
          startedAt: processEntry.startedAt.toISOString()
        }
      : null,
    logs: normalizedLogs,
    lastError
  }
}

export async function appendBrokCodeRuntimeBrowserEvent({
  runtime,
  event
}: {
  runtime: BrokCodeRuntimeSandbox
  event: BrokCodeRuntimeBrowserEvent
}) {
  const processEntry = getBrokCodeRuntimeProcess(runtime.id)
  const message =
    typeof event.message === 'string' && event.message.trim()
      ? event.message
      : 'Browser runtime event'
  const level = event.level === 'warn' ? 'warn' : 'error'
  const file =
    typeof event.file === 'string'
      ? event.file
      : typeof event.source === 'string'
        ? event.source
        : undefined
  const line = typeof event.line === 'number' ? event.line : undefined
  const column = typeof event.column === 'number' ? event.column : undefined
  const stack = typeof event.stack === 'string' ? event.stack : undefined
  const logs = createRuntimeLogs({
    level,
    source: 'browser',
    message,
    file,
    line,
    column,
    stack
  })
  const nextLogs = [
    ...((processEntry?.logs.length
      ? processEntry.logs
      : (runtime.logs ?? [])) as
      | BrokCodeRuntimeLog[]
      | Array<Record<string, unknown>>),
    ...logs
  ].slice(-MAX_RUNTIME_LOGS)

  if (processEntry) {
    processEntry.logs = nextLogs as BrokCodeRuntimeLog[]
  }

  await updateBrokCodeRuntimeSandbox({
    id: runtime.id,
    workspaceId: runtime.workspaceId,
    userId: runtime.userId,
    logs: nextLogs
  })

  return logs
}

export async function persistBrokCodeRuntimeProcessExit({
  runtime,
  entry,
  code,
  signal
}: {
  runtime: BrokCodeRuntimeSandbox
  entry: RuntimeProcess
  code: number | null
  signal?: NodeJS.Signals | null
}) {
  const status = code === 0 ? 'stopped' : 'crashed'
  const exitSummary =
    code === 0
      ? 'Runtime stopped cleanly.'
      : signal
        ? `Runtime exited after signal ${signal}.`
        : `Runtime exited ${code ?? 'unexpectedly'}.`
  entry.status = status
  appendLog(entry, status === 'stopped' ? 'info' : 'error', exitSummary, {
    source: 'dev-server'
  })

  await updateBrokCodeRuntimeSandbox({
    id: runtime.id,
    workspaceId: runtime.workspaceId,
    userId: runtime.userId,
    status,
    logs: entry.logs,
    health: {
      ok: false,
      checkedAt: new Date().toISOString(),
      url: entry.url || undefined,
      message: exitSummary
    },
    metadata: {
      ...(runtime.metadata ?? {}),
      livePreview: {
        status,
        port: entry.port || null,
        url: entry.url || null,
        proxyPath: `/api/brokcode/runtime/${encodeURIComponent(runtime.id)}/`,
        startedAt: entry.startedAt.toISOString(),
        stoppedAt: new Date().toISOString(),
        exitCode: code,
        signal: signal ?? null
      }
    }
  })
}

export async function startBrokCodeRuntimeProcess({
  runtime,
  manifest
}: {
  runtime: BrokCodeRuntimeSandbox
  manifest: BrokCodeRuntimeWorkspaceManifest
}) {
  const existing = getBrokCodeRuntimeProcess(runtime.id)
  if (existing && existing.status === 'ready') {
    if (!(await waitForRuntime(existing.url))) {
      await markRuntimeProcessUnavailable({ runtime, entry: existing })
    } else {
      const decision = getBrokCodeRuntimeProcessReuseDecision({
        runtime,
        manifest
      })
      if (decision.action === 'restart') {
        await stopRuntimeProcessForRestart({
          entry: existing,
          reason: decision.reason
        })
      } else {
        return refreshExistingRuntimeProcess({
          runtime,
          entry: existing,
          manifest,
          decision
        })
      }
    }
  } else if (
    existing &&
    existing.status !== 'crashed' &&
    existing.status !== 'stopped'
  ) {
    return existing
  }

  const command = commandFor({ manifest, port: 0 })
  if (!command) return null
  const entry: RuntimeProcess = {
    runtimeId: runtime.id,
    port: 0,
    url: '',
    process: null,
    status: 'starting',
    logs: [],
    startedAt: new Date()
  }
  getRuntimeProcesses().set(runtime.id, entry)

  await updateBrokCodeRuntimeSandbox({
    id: runtime.id,
    workspaceId: runtime.workspaceId,
    userId: runtime.userId,
    status: 'running',
    metadata: {
      ...(runtime.metadata ?? {}),
      livePreview: {
        status: 'starting',
        startedAt: new Date().toISOString()
      }
    }
  })

  try {
    await installDependencies({
      manifest,
      workspacePath: manifest.workspacePath,
      entry
    })
  } catch (error) {
    entry.status = 'crashed'
    appendLog(
      entry,
      'error',
      error instanceof Error ? error.message : 'Dependency install failed.',
      { source: 'install', command: 'bun install' }
    )
    await updateBrokCodeRuntimeSandbox({
      id: runtime.id,
      workspaceId: runtime.workspaceId,
      userId: runtime.userId,
      status: 'crashed',
      logs: entry.logs,
      health: {
        ok: false,
        checkedAt: new Date().toISOString(),
        message: 'Dependency install failed.'
      },
      metadata: runtime.metadata ?? {}
    })
    throw error
  }

  const port = await findFreePort()
  const resolvedCommand = commandFor({ manifest, port })
  if (!resolvedCommand) return null
  const url = `http://127.0.0.1:${port}`
  const child = spawn(resolvedCommand.command, resolvedCommand.args, {
    cwd: manifest.workspacePath,
    env: {
      ...process.env,
      BROWSER: 'none',
      FORCE_COLOR: '0'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  entry.port = port
  entry.url = url
  entry.process = child

  appendLog(
    entry,
    'info',
    `${resolvedCommand.command} ${resolvedCommand.args.join(' ')}`,
    {
      source: 'dev-server',
      command: `${resolvedCommand.command} ${resolvedCommand.args.join(' ')}`
    }
  )
  child.stdout.on('data', chunk =>
    appendLog(entry, 'info', String(chunk), {
      source: 'dev-server',
      command: `${resolvedCommand.command} ${resolvedCommand.args.join(' ')}`
    })
  )
  child.stderr.on('data', chunk =>
    appendLog(entry, 'error', String(chunk), {
      source: 'dev-server',
      command: `${resolvedCommand.command} ${resolvedCommand.args.join(' ')}`
    })
  )
  child.on('exit', (code, signal) => {
    void persistBrokCodeRuntimeProcessExit({
      runtime,
      entry,
      code,
      signal
    }).catch(error => {
      console.error('BrokCode runtime exit persistence failed:', error)
    })
  })

  const ready = await waitForRuntime(url)
  entry.status = ready ? 'ready' : 'crashed'
  const proxyPath = `/api/brokcode/runtime/${encodeURIComponent(runtime.id)}/`
  await updateBrokCodeRuntimeSandbox({
    id: runtime.id,
    workspaceId: runtime.workspaceId,
    userId: runtime.userId,
    status: ready ? 'healthy' : 'crashed',
    logs: entry.logs,
    health: {
      ok: ready,
      checkedAt: new Date().toISOString(),
      url
    },
    metadata: {
      ...(runtime.metadata ?? {}),
      livePreview: {
        status: entry.status,
        port,
        url,
        proxyPath,
        startedAt: entry.startedAt.toISOString()
      }
    }
  })

  return entry
}
