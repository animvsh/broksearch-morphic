import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

import {
  BrokCodeRuntimeSandbox,
  updateBrokCodeRuntimeSandbox
} from '@/lib/brokcode/runtime/store'
import { BrokCodeRuntimeWorkspaceManifest } from '@/lib/brokcode/runtime/workspace'

type RuntimeProcess = {
  runtimeId: string
  port: number
  url: string
  process: ReturnType<typeof spawn>
  status: 'starting' | 'ready' | 'crashed' | 'stopped'
  logs: Array<Record<string, unknown>>
  startedAt: Date
}

const runtimeProcesses = new Map<string, RuntimeProcess>()

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
  level: 'info' | 'error',
  message: string
) {
  entry.logs = [
    ...entry.logs.slice(-199),
    {
      level,
      message,
      at: new Date().toISOString()
    }
  ]
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

async function installDependencies({
  manifest,
  workspacePath
}: {
  manifest: BrokCodeRuntimeWorkspaceManifest
  workspacePath: string
}) {
  if (manifest.packageManager === 'none') return

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
    child.stderr.on('data', chunk => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `bun install exited ${code}`))
    })
  })
}

export function getBrokCodeRuntimeProcess(runtimeId: string) {
  return getRuntimeProcesses().get(runtimeId) ?? null
}

export async function startBrokCodeRuntimeProcess({
  runtime,
  manifest
}: {
  runtime: BrokCodeRuntimeSandbox
  manifest: BrokCodeRuntimeWorkspaceManifest
}) {
  const existing = getBrokCodeRuntimeProcess(runtime.id)
  if (
    existing &&
    existing.status !== 'crashed' &&
    existing.status !== 'stopped'
  ) {
    return existing
  }

  const command = commandFor({ manifest, port: 0 })
  if (!command) return null

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

  await installDependencies({
    manifest,
    workspacePath: manifest.workspacePath
  })

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
  const entry: RuntimeProcess = {
    runtimeId: runtime.id,
    port,
    url,
    process: child,
    status: 'starting',
    logs: [],
    startedAt: new Date()
  }
  getRuntimeProcesses().set(runtime.id, entry)

  child.stdout.on('data', chunk => appendLog(entry, 'info', String(chunk)))
  child.stderr.on('data', chunk => appendLog(entry, 'error', String(chunk)))
  child.on('exit', code => {
    entry.status = code === 0 ? 'stopped' : 'crashed'
    appendLog(entry, code === 0 ? 'info' : 'error', `Runtime exited ${code}.`)
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
