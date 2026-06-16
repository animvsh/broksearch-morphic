import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { request } from 'playwright'

const baseUrl = normalizeOrigin(
  process.env.BROKMAIL_SMOKE_BASE_URL ||
    process.env.BROK_SMOKE_BASE_URL ||
    process.env.SMOKE_BASE_URL ||
    'https://www.brok.fyi'
)
const outputRoot =
  process.env.BROKMAIL_SMOKE_OUTPUT_DIR || '.brok-smoke/brokmail-composio'
const authStatePath =
  process.env.BROKMAIL_AUTH_STATE_PATH || process.env.BROK_AUTH_STATE_PATH
const cookieHeader =
  process.env.BROKMAIL_SMOKE_COOKIE || process.env.BROK_SMOKE_COOKIE
const timeoutMs = Number(process.env.BROKMAIL_SMOKE_TIMEOUT_MS || 30000)
const requireResults = process.env.BROKMAIL_SMOKE_REQUIRE_RESULTS === 'true'

type SmokeStatus = 'passed' | 'failed'

type CheckResult = {
  name: string
  path: string
  status: SmokeStatus
  httpStatus: number
  notes: string[]
  payloadSummary: Record<string, unknown> | null
}

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function stampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-')
}

function summarizePayload(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  return {
    provider: record.provider,
    connected: record.connected,
    accountConnected: record.accountConnected,
    executionReady: record.executionReady,
    connectedCount: record.connectedCount,
    threads: Array.isArray(record.threads) ? record.threads.length : undefined,
    events: Array.isArray(record.events) ? record.events.length : undefined,
    toolSlug: record.toolSlug,
    message: record.message,
    error: record.error
  }
}

function requireBoolean(
  payload: Record<string, unknown>,
  key: string,
  notes: string[]
) {
  if (payload[key] !== true) {
    notes.push(`${key} was ${String(payload[key])}, expected true`)
  }
}

async function main() {
  const checkedAt = new Date().toISOString()
  const runDir = path.join(outputRoot, stampForFile(new Date(checkedAt)))
  await mkdir(runDir, { recursive: true })

  if (!authStatePath && !cookieHeader) {
    throw new Error(
      'BrokMail Composio smoke requires BROK_AUTH_STATE_PATH, BROKMAIL_AUTH_STATE_PATH, BROK_SMOKE_COOKIE, or BROKMAIL_SMOKE_COOKIE.'
    )
  }

  const api = await request.newContext({
    baseURL: baseUrl,
    storageState: authStatePath,
    extraHTTPHeaders: cookieHeader ? { Cookie: cookieHeader } : undefined,
    timeout: timeoutMs
  })

  const checks: CheckResult[] = []

  async function checkJson(
    name: string,
    routePath: string,
    validate: (payload: Record<string, unknown>, notes: string[]) => void
  ) {
    const response = await api.get(routePath)
    const payload = (await response.json().catch(async () => ({
      error: await response.text().catch(() => 'unreadable response')
    }))) as Record<string, unknown>
    const notes: string[] = []

    if (!response.ok()) {
      notes.push(`HTTP ${response.status()} from ${routePath}`)
    } else {
      validate(payload, notes)
    }

    checks.push({
      name,
      path: routePath,
      status: notes.length === 0 ? 'passed' : 'failed',
      httpStatus: response.status(),
      notes,
      payloadSummary: summarizePayload(payload)
    })
  }

  await checkJson(
    'Gmail status is connected and execution-ready',
    '/api/brokmail/gmail/status',
    (payload, notes) => {
      requireBoolean(payload, 'connected', notes)
      requireBoolean(payload, 'accountConnected', notes)
      requireBoolean(payload, 'executionReady', notes)
    }
  )

  await checkJson(
    'Calendar status is connected and execution-ready',
    '/api/brokmail/gcal/status',
    (payload, notes) => {
      requireBoolean(payload, 'connected', notes)
      requireBoolean(payload, 'accountConnected', notes)
      requireBoolean(payload, 'executionReady', notes)
    }
  )

  await checkJson(
    'Gmail live threads load through Composio',
    '/api/brokmail/gmail/threads',
    (payload, notes) => {
      if (payload.provider !== 'composio') {
        notes.push(
          `provider was ${String(payload.provider)}, expected composio`
        )
      }
      if (!Array.isArray(payload.threads)) {
        notes.push('threads was not an array')
      } else if (requireResults && payload.threads.length === 0) {
        notes.push('threads was empty')
      }
    }
  )

  await checkJson(
    'Calendar live events load through Composio',
    '/api/brokmail/gcal/events',
    (payload, notes) => {
      if (payload.provider !== 'composio') {
        notes.push(
          `provider was ${String(payload.provider)}, expected composio`
        )
      }
      if (!Array.isArray(payload.events)) {
        notes.push('events was not an array')
      } else if (requireResults && payload.events.length === 0) {
        notes.push('events was empty')
      }
    }
  )

  await api.dispose()

  const failed = checks.filter(check => check.status === 'failed')
  const report = {
    checkedAt,
    baseUrl,
    authMode: authStatePath ? `storage-state:${authStatePath}` : 'cookie',
    requireResults,
    status: failed.length === 0 ? 'passed' : 'failed',
    checks
  }
  const markdown = [
    '# BrokMail Composio smoke',
    '',
    `Checked: ${checkedAt}`,
    `Base URL: ${baseUrl}`,
    `Auth mode: ${report.authMode}`,
    `Require non-empty results: ${requireResults ? 'yes' : 'no'}`,
    `Status: ${report.status}`,
    '',
    '| Status | Check | HTTP | Notes | Payload |',
    '| --- | --- | --- | --- | --- |',
    ...checks.map(check =>
      [
        check.status,
        check.name,
        String(check.httpStatus),
        check.notes.join('; ') || 'ok',
        JSON.stringify(check.payloadSummary)
      ]
        .map(value => String(value).replace(/\n/g, ' '))
        .join(' | ')
    )
  ].join('\n')

  await writeFile(
    path.join(runDir, 'results.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  )
  await writeFile(path.join(runDir, 'summary.md'), `${markdown}\n`, 'utf8')
  await mkdir(outputRoot, { recursive: true })
  await writeFile(path.join(outputRoot, 'latest.md'), `${markdown}\n`, 'utf8')

  console.log(`BrokMail Composio smoke wrote ${runDir}`)
  console.log(`status=${report.status}; checks=${checks.length}`)

  if (failed.length > 0) {
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
