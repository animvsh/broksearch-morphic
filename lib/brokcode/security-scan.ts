import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

export type DeepSecPhase =
  | 'setup'
  | 'scan'
  | 'process'
  | 'revalidate'
  | 'export'
  | 'status'

export type DeepSecCommandResult = {
  command: string
  cwd: string
  exitCode: number | null
  durationMs: number
  stdout: string
  stderr: string
}

export type DeepSecRunResult = {
  handled: true
  phase: DeepSecPhase
  ok: boolean
  cwd: string
  deepsecDir: string
  content: string
  commands: DeepSecCommandResult[]
}

const MAX_OUTPUT_CHARS = 80_000
const DEFAULT_TIMEOUT_MS = 1000 * 60 * 8

export function isDeepSecSecurityScanCommand(command: string) {
  const normalized = command.trim().toLowerCase()
  return (
    normalized.startsWith('/securityscan') ||
    normalized.includes('/securityscan') ||
    /\bdeepsec\b/.test(normalized) ||
    /\bsecurity\s+scan\b/.test(normalized) ||
    /\bvulnerability\s+scan\b/.test(normalized)
  )
}

export function parseDeepSecPhase(command: string): DeepSecPhase {
  const normalized = command.toLowerCase()

  if (/\b(status|doctor|check setup)\b/.test(normalized)) return 'status'
  if (/\b(init|setup|bootstrap)\b/.test(normalized)) return 'setup'
  if (/\brevalidate\b/.test(normalized)) return 'revalidate'
  if (/\b(export|report|findings)\b/.test(normalized)) return 'export'
  if (/\b(process|triage|investigate|ai review|ai scan)\b/.test(normalized)) {
    return 'process'
  }

  return 'scan'
}

export function parseDeepSecArgs(command: string, phase: DeepSecPhase) {
  const normalized = command.toLowerCase()
  const args = [phase] as string[]

  if (phase === 'process' && /\b(diff|pr|pull request|changed files)\b/.test(normalized)) {
    args.push('--diff')
  }

  if (phase === 'export') {
    args.push('--format', 'md-dir', '--out', './findings')
  }

  return args
}

function truncateOutput(value: string) {
  if (value.length <= MAX_OUTPUT_CHARS) return value
  return `${value.slice(0, MAX_OUTPUT_CHARS)}\n\n[output truncated after ${MAX_OUTPUT_CHARS} chars]`
}

function stripAnsi(value: string) {
  return value.replace(/\x1b\[[0-9;]*m/g, '')
}

function formatCommand(command: string, args: string[]) {
  return [command, ...args].join(' ')
}

async function runProcess({
  command,
  args,
  cwd,
  env,
  timeoutMs = DEFAULT_TIMEOUT_MS
}: {
  command: string
  args: string[]
  cwd: string
  env?: Partial<NodeJS.ProcessEnv>
  timeoutMs?: number
}): Promise<DeepSecCommandResult> {
  const startedAt = Date.now()

  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        CI: process.env.CI ?? '1',
        ...env
      },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const timeout = setTimeout(() => {
      if (settled) return
      stderr += `\nTimed out after ${timeoutMs / 1000}s.`
      child.kill('SIGTERM')
    }, timeoutMs)

    child.stdout.on('data', chunk => {
      stdout = truncateOutput(stdout + chunk.toString())
    })

    child.stderr.on('data', chunk => {
      stderr = truncateOutput(stderr + chunk.toString())
    })

    child.on('error', error => {
      settled = true
      clearTimeout(timeout)
      resolve({
        command: formatCommand(command, args),
        cwd,
        exitCode: 127,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr: truncateOutput(`${stderr}${stderr ? '\n' : ''}${error.message}`)
      })
    })

    child.on('close', exitCode => {
      settled = true
      clearTimeout(timeout)
      resolve({
        command: formatCommand(command, args),
        cwd,
        exitCode,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr
      })
    })
  })
}

async function commandExists(command: string) {
  const result = await runProcess({
    command,
    args: ['--version'],
    cwd: process.cwd(),
    timeoutMs: 10_000
  })
  return result.exitCode === 0
}

async function runPnpm(
  args: string[],
  cwd: string,
  env: Partial<NodeJS.ProcessEnv>
) {
  if (await commandExists('pnpm')) {
    return runProcess({ command: 'pnpm', args, cwd, env })
  }

  return runProcess({ command: 'corepack', args: ['pnpm', ...args], cwd, env })
}

function buildDeepSecEnv({
  apiKey,
  baseUrl
}: {
  apiKey?: string | null
  baseUrl?: string | null
}) {
  const env: Partial<NodeJS.ProcessEnv> = {}

  if (apiKey?.startsWith('brok_sk_')) {
    env.OPENAI_API_KEY = apiKey
    env.ANTHROPIC_API_KEY = apiKey
  }

  if (baseUrl) {
    const normalized = baseUrl.replace(/\/$/, '')
    env.OPENAI_BASE_URL = normalized.endsWith('/v1') ? normalized : `${normalized}/v1`
    env.ANTHROPIC_BASE_URL = normalized.replace(/\/v1$/, '')
  }

  return env
}

function summarizeResult(result: DeepSecRunResult) {
  const lines = [
    `DeepSec ${result.phase} ${result.ok ? 'completed' : 'failed'}.`,
    '',
    `Repository: ${result.cwd}`,
    `DeepSec workspace: ${result.deepsecDir}`,
    '',
    'Commands run:'
  ]

  for (const command of result.commands) {
    lines.push(
      `- ${command.command} (${command.exitCode === 0 ? 'ok' : `exit ${command.exitCode}`}, ${Math.round(command.durationMs / 1000)}s)`
    )
  }

  const last = result.commands[result.commands.length - 1]
  if (last) {
    const output = [last.stdout.trim(), last.stderr.trim()]
      .filter(Boolean)
      .join('\n\n')
      .trim()
    if (output) {
      lines.push(
        '',
        'Latest output:',
        '```text',
        stripAnsi(output).slice(-12000),
        '```'
      )
    }
  }

  return lines.join('\n')
}

export async function runDeepSecSecurityScan({
  command,
  apiKey,
  baseUrl
}: {
  command: string
  apiKey?: string | null
  baseUrl?: string | null
}): Promise<DeepSecRunResult> {
  const phase = parseDeepSecPhase(command)
  const cwd = process.env.BROKCODE_SECURITY_SCAN_CWD
    ? path.resolve(process.env.BROKCODE_SECURITY_SCAN_CWD)
    : process.cwd()
  const deepsecDir = path.join(/* turbopackIgnore: true */ cwd, '.deepsec')
  const commands: DeepSecCommandResult[] = []
  const env = buildDeepSecEnv({ apiKey, baseUrl })

  if (phase === 'status') {
    const result: DeepSecRunResult = {
      handled: true,
      phase,
      ok: existsSync(deepsecDir),
      cwd,
      deepsecDir,
      commands,
      content: ''
    }
    result.content = existsSync(deepsecDir)
      ? `DeepSec is initialized at ${deepsecDir}. Run /securityscan to scan.`
      : `DeepSec is not initialized yet. Run /securityscan setup or /securityscan to initialize and scan.`
    return result
  }

  if (!existsSync(deepsecDir)) {
    commands.push(
      await runProcess({
        command: 'npx',
        args: ['--yes', 'deepsec', 'init'],
        cwd,
        env,
        timeoutMs: DEFAULT_TIMEOUT_MS
      })
    )
  }

  if (!existsSync(deepsecDir)) {
    const result: DeepSecRunResult = {
      handled: true,
      phase,
      ok: false,
      cwd,
      deepsecDir,
      commands,
      content: ''
    }
    result.content = summarizeResult(result)
    return result
  }

  const packageJson = path.join(deepsecDir, 'package.json')
  const nodeModules = path.join(deepsecDir, 'node_modules', 'deepsec')
  if (existsSync(packageJson) && !existsSync(nodeModules)) {
    commands.push(
      await runPnpm(['install', '--frozen-lockfile=false'], deepsecDir, env)
    )
  }

  if (phase !== 'setup') {
    commands.push(await runPnpm(['deepsec', ...parseDeepSecArgs(command, phase)], deepsecDir, env))
  }

  const ok = commands.every(commandResult => commandResult.exitCode === 0)
  const result: DeepSecRunResult = {
    handled: true,
    phase,
    ok,
    cwd,
    deepsecDir,
    commands,
    content: ''
  }
  result.content = summarizeResult(result)
  return result
}
