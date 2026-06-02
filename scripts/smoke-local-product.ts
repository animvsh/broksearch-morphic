import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { type Browser, chromium } from 'playwright'

type Viewport = 'desktop' | 'mobile'

type PageCheck = {
  label: string
  path: string
  requiredAny: string[]
  viewports: Viewport[]
}

type PageResult = {
  kind: 'page'
  label: string
  path: string
  viewport: Viewport
  status: 'ok' | 'missing_signal' | 'auth_redirect' | 'server_error' | 'error'
  httpStatus: number | null
  finalUrl: string
  foundSignals: string[]
  missingSignals: string[]
  horizontalOverflow: number
  pageErrors: string[]
  consoleErrors: string[]
  error?: string
}

type ApiResult = {
  kind: 'api'
  label: string
  path: string
  status: 'ok' | 'error'
  httpStatus: number | null
  foundSignals: string[]
  error?: string
}

type SmokeResult = PageResult | ApiResult

const baseUrl = normalizeOrigin(
  process.env.BROK_LOCAL_SMOKE_BASE_URL ||
    process.env.SMOKE_BASE_URL ||
    'http://127.0.0.1:3000'
)
const outputRoot =
  process.env.BROK_LOCAL_SMOKE_OUTPUT_DIR || '.brok-smoke/local-product'
const timeoutMs = Number(process.env.BROK_LOCAL_SMOKE_TIMEOUT_MS || 30000)
const startServer = process.env.BROK_LOCAL_SMOKE_START_SERVER !== 'false'
const failOnConsoleError =
  process.env.BROK_LOCAL_SMOKE_FAIL_ON_CONSOLE_ERROR === 'true'

const pageChecks: PageCheck[] = [
  {
    label: 'search',
    path: '/',
    requiredAny: ['Ask anything', 'Ask a question', 'Search'],
    viewports: ['desktop', 'mobile']
  },
  {
    label: 'brokcode',
    path: '/brokcode',
    requiredAny: ['BrokCode', 'Ask Brok Code', 'Preview', 'Deploy'],
    viewports: ['desktop', 'mobile']
  },
  {
    label: 'brokmail',
    path: '/brokmail',
    requiredAny: ['BrokMail', 'Inbox', 'Compose', 'Calendar'],
    viewports: ['desktop', 'mobile']
  },
  {
    label: 'playground',
    path: '/playground',
    requiredAny: ['BrokCode API', 'Streaming sandbox', 'API key'],
    viewports: ['desktop']
  },
  {
    label: 'api-keys',
    path: '/api-keys',
    requiredAny: ['Brok API keys', 'Developer platform', 'New key'],
    viewports: ['desktop']
  },
  {
    label: 'usage',
    path: '/usage',
    requiredAny: ['Usage dashboard', 'Requests', 'API keys'],
    viewports: ['desktop']
  },
  {
    label: 'presentations',
    path: '/presentations',
    requiredAny: [
      'Brok Presentations',
      'reveal.js preview',
      'Editable deck script'
    ],
    viewports: ['desktop', 'mobile']
  }
]

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function urlFor(routePath: string) {
  return `${baseUrl}${routePath.startsWith('/') ? routePath : `/${routePath}`}`
}

function stampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-')
}

function viewportSize(viewport: Viewport) {
  return viewport === 'mobile'
    ? { width: 390, height: 844 }
    : { width: 1440, height: 1000 }
}

async function sleep(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function probeServer() {
  try {
    const response = await fetch(urlFor('/'), {
      signal: AbortSignal.timeout(2000)
    })
    return response.ok
  } catch {
    return false
  }
}

async function waitForServer(getStartupError?: () => string | null) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await probeServer()) return
    const startupError = getStartupError?.()
    if (startupError) throw new Error(startupError)
    await sleep(500)
  }

  throw new Error(`Timed out waiting for ${baseUrl}`)
}

function localServerEnv() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    'postgres://brok:brok@127.0.0.1:5432/brok_local_smoke_unavailable'

  return {
    ...process.env,
    ENABLE_AUTH: 'false',
    APP_ACCESS_GATE: 'false',
    BROK_CLOUD_DEPLOYMENT: 'false',
    BROKCODE_ALLOW_LOCAL_BROWSER_SESSION_FALLBACK: 'true',
    DATABASE_URL: databaseUrl,
    DATABASE_RESTRICTED_URL: databaseUrl
  }
}

async function ensureLocalServer() {
  if (await probeServer()) {
    return { process: null, started: false }
  }

  if (!startServer) {
    throw new Error(
      `${baseUrl} is not reachable and BROK_LOCAL_SMOKE_START_SERVER=false`
    )
  }

  const parsedUrl = new URL(baseUrl)
  const port =
    parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80')
  const hostname = parsedUrl.hostname
  const serverLogs: string[] = []
  let startupExit: string | null = null
  const bunExecutable = process.env.BUN_EXECUTABLE || process.execPath || 'bun'
  const child = spawn(
    bunExecutable,
    ['run', 'dev', '--hostname', hostname, '--port', port],
    {
      cwd: process.cwd(),
      env: localServerEnv(),
      stdio: 'pipe'
    }
  )

  child.stdout.on('data', chunk => {
    serverLogs.push(String(chunk))
    if (process.env.BROK_LOCAL_SMOKE_VERBOSE_SERVER === 'true') {
      process.stdout.write(chunk)
    }
  })
  child.stderr.on('data', chunk => {
    serverLogs.push(String(chunk))
    if (process.env.BROK_LOCAL_SMOKE_VERBOSE_SERVER === 'true') {
      process.stderr.write(chunk)
    }
  })
  child.once('exit', (code, signal) => {
    startupExit = `local dev server exited before ${baseUrl} became reachable (code=${code}, signal=${signal}). Last output:\n${serverLogs
      .join('')
      .split('\n')
      .slice(-16)
      .join('\n')}`
  })

  await waitForServer(() => startupExit)
  return { process: child, started: true }
}

async function checkPage(
  browser: Browser,
  check: PageCheck,
  viewport: Viewport
): Promise<PageResult> {
  const page = await browser.newPage({ viewport: viewportSize(viewport) })
  const pageErrors: string[] = []
  const consoleErrors: string[] = []

  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  try {
    const response = await page.goto(urlFor(check.path), {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs
    })
    await page.waitForTimeout(600)

    const finalUrl = page.url()
    const httpStatus = response?.status() ?? null

    if (
      finalUrl.includes('/auth/login') ||
      finalUrl.includes('/auth/access-pending')
    ) {
      return {
        kind: 'page',
        label: check.label,
        path: check.path,
        viewport,
        status: 'auth_redirect',
        httpStatus,
        finalUrl,
        foundSignals: [],
        missingSignals: check.requiredAny,
        horizontalOverflow: 0,
        pageErrors,
        consoleErrors
      }
    }

    if (httpStatus && httpStatus >= 500) {
      return {
        kind: 'page',
        label: check.label,
        path: check.path,
        viewport,
        status: 'server_error',
        httpStatus,
        finalUrl,
        foundSignals: [],
        missingSignals: check.requiredAny,
        horizontalOverflow: 0,
        pageErrors,
        consoleErrors
      }
    }

    const visibleText = await page.locator('body').innerText({
      timeout: timeoutMs
    })
    const lowerText = visibleText.toLowerCase()
    const foundSignals = check.requiredAny.filter(signal =>
      lowerText.includes(signal.toLowerCase())
    )
    const horizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
    const missingSignals = foundSignals.length > 0 ? [] : [...check.requiredAny]
    const status =
      foundSignals.length > 0 &&
      pageErrors.length === 0 &&
      horizontalOverflow <= 2 &&
      (!failOnConsoleError || consoleErrors.length === 0)
        ? 'ok'
        : 'missing_signal'

    return {
      kind: 'page',
      label: check.label,
      path: check.path,
      viewport,
      status,
      httpStatus,
      finalUrl,
      foundSignals,
      missingSignals,
      horizontalOverflow,
      pageErrors,
      consoleErrors
    }
  } catch (error) {
    return {
      kind: 'page',
      label: check.label,
      path: check.path,
      viewport,
      status: 'error',
      httpStatus: null,
      finalUrl: page.url(),
      foundSignals: [],
      missingSignals: check.requiredAny,
      horizontalOverflow: 0,
      pageErrors,
      consoleErrors,
      error: error instanceof Error ? error.message : String(error)
    }
  } finally {
    await page.close()
  }
}

async function checkModelsApi(): Promise<ApiResult> {
  try {
    const response = await fetch(urlFor('/api/v1/models'), {
      signal: AbortSignal.timeout(timeoutMs)
    })
    const body = await response.json().catch(() => null)

    if (response.status !== 401) {
      throw new Error(`expected unauthenticated 401, got ${response.status}`)
    }

    if (body?.error?.code !== 'missing_authorization') {
      throw new Error(
        'expected /api/v1/models to require an Authorization Bearer token or x-api-key header'
      )
    }

    return {
      kind: 'api',
      label: 'models-api-auth-required',
      path: '/api/v1/models',
      status: 'ok',
      httpStatus: response.status,
      foundSignals: [body.error.code]
    }
  } catch (error) {
    return {
      kind: 'api',
      label: 'models-api-auth-required',
      path: '/api/v1/models',
      status: 'error',
      httpStatus: null,
      foundSignals: [],
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

function resultNotes(result: SmokeResult) {
  if (result.kind === 'api') return result.error ?? ''

  return [
    result.error,
    result.missingSignals.length > 0
      ? `missing any of: ${result.missingSignals.join(', ')}`
      : '',
    result.pageErrors.length > 0
      ? `page errors: ${result.pageErrors.slice(0, 2).join('; ')}`
      : '',
    failOnConsoleError && result.consoleErrors.length > 0
      ? `console errors: ${result.consoleErrors.slice(0, 2).join('; ')}`
      : '',
    result.horizontalOverflow > 2
      ? `horizontal overflow: ${result.horizontalOverflow}px`
      : ''
  ]
    .filter(Boolean)
    .join('; ')
}

function renderMarkdown(report: {
  checkedAt: string
  baseUrl: string
  startedServer: boolean
  results: SmokeResult[]
}) {
  const rows = report.results.map(result =>
    [
      result.status,
      result.kind,
      result.label,
      result.kind === 'page' ? result.viewport : 'api',
      result.path,
      result.httpStatus ?? '',
      result.foundSignals.join(', ') || 'none',
      resultNotes(result).replace(/\n/g, ' ').slice(0, 260)
    ]
      .map(value => String(value).replace(/\|/g, '\\|'))
      .join(' | ')
  )

  return [
    '# Local Brok product smoke',
    '',
    `Checked: ${report.checkedAt}`,
    `Base URL: ${report.baseUrl}`,
    `Started server: ${report.startedServer ? 'yes' : 'no'}`,
    '',
    '| Status | Kind | Surface | Viewport | Path | HTTP | Found signals | Notes |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(row => `| ${row} |`),
    '',
    '## Required local mode',
    '',
    'The managed server path runs with `ENABLE_AUTH=false`, `APP_ACCESS_GATE=false`, `BROK_CLOUD_DEPLOYMENT=false`, and `BROKCODE_ALLOW_LOCAL_BROWSER_SESSION_FALLBACK=true` so protected product surfaces can be verified through local fallback behavior.'
  ].join('\n')
}

async function stopServer(child: ChildProcessWithoutNullStreams | null) {
  if (!child || child.killed) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    sleep(3000).then(() => child.kill('SIGKILL'))
  ])
}

async function main() {
  const server = await ensureLocalServer()
  const browser = await chromium.launch({ headless: true })

  try {
    const results: SmokeResult[] = [await checkModelsApi()]
    for (const check of pageChecks) {
      for (const viewport of check.viewports) {
        results.push(await checkPage(browser, check, viewport))
      }
    }

    const checkedAt = new Date().toISOString()
    const runDir = path.join(outputRoot, stampForFile(new Date(checkedAt)))
    const report = {
      checkedAt,
      baseUrl,
      startedServer: server.started,
      results
    }
    const markdown = renderMarkdown(report)
    await mkdir(runDir, { recursive: true })
    await writeFile(
      path.join(runDir, 'results.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    )
    await writeFile(path.join(runDir, 'summary.md'), `${markdown}\n`, 'utf8')
    await mkdir(outputRoot, { recursive: true })
    await writeFile(path.join(outputRoot, 'latest.md'), `${markdown}\n`, 'utf8')

    const failures = results.filter(result => result.status !== 'ok')
    console.log(`local product smoke wrote ${runDir}`)
    console.log(
      `checked ${results.length} surfaces/viewports; failures=${failures.length}`
    )
    for (const result of results) {
      const viewport = result.kind === 'page' ? ` ${result.viewport}` : ''
      const note = resultNotes(result)
      console.log(
        `${result.status.toUpperCase()} ${result.label}${viewport} ${result.path}${
          note ? ` - ${note}` : ''
        }`
      )
    }

    if (failures.length > 0) {
      process.exitCode = 1
    }
  } finally {
    await browser.close()
    await stopServer(server.process)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
