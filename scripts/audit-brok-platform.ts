import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { chromium } from 'playwright'

const execFileAsync = promisify(execFile)

const baseUrl = normalizeOrigin(
  process.env.BROK_AUDIT_BASE_URL || 'https://www.brok.fyi'
)
const docsUrl = normalizeOrigin(
  process.env.BROK_AUDIT_DOCS_URL || 'https://docs.brok.fyi'
)
const outputDir = process.env.BROK_AUDIT_DIR || '.brok-audits'
const timeoutMs = Number(process.env.BROK_AUDIT_TIMEOUT_MS || 15000)
const runRailway = process.env.BROK_AUDIT_RAILWAY !== 'false'

type RouteCheck = {
  label: string
  url: string
  expected: 'public-ok' | 'auth-or-ok' | 'api-ok'
}

type FetchResult = RouteCheck & {
  ok: boolean
  status: number
  finalUrl: string
  location: string | null
  ms: number
  error?: string
}

type BrowserResult = {
  url: string
  status: number | null
  finalUrl: string
  title: string
  textSample: string
  desktopOverflowX: number
  mobileOverflowX: number
  pageErrors: string[]
  consoleErrors: string[]
  ok: boolean
  error?: string
}

type RailwayResult = {
  ok: boolean
  status?: string
  deploymentId?: string
  service?: string
  error?: string
}

const routeChecks: RouteCheck[] = [
  { label: 'home', url: `${baseUrl}/`, expected: 'public-ok' },
  { label: 'docs', url: `${docsUrl}/docs`, expected: 'public-ok' },
  { label: 'brokcode', url: `${baseUrl}/brokcode`, expected: 'auth-or-ok' },
  { label: 'brokmail', url: `${baseUrl}/brokmail`, expected: 'auth-or-ok' },
  {
    label: 'humanizer',
    url: `${baseUrl}/tools/humanizer`,
    expected: 'auth-or-ok'
  },
  {
    label: 'integrations',
    url: `${baseUrl}/integrations`,
    expected: 'auth-or-ok'
  },
  { label: 'usage', url: `${baseUrl}/usage`, expected: 'auth-or-ok' },
  { label: 'models-api', url: `${baseUrl}/api/v1/models`, expected: 'api-ok' }
]

const browserUrls = [
  `${baseUrl}/`,
  `${baseUrl}/brokcode`,
  `${baseUrl}/brokmail`,
  `${baseUrl}/tools/humanizer`,
  `${baseUrl}/integrations`,
  `${docsUrl}/docs`
]

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function stampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-')
}

function isFetchOk(result: FetchResult) {
  if (result.expected === 'api-ok') return result.status === 200
  if (result.expected === 'public-ok')
    return result.status >= 200 && result.status < 300

  return (
    (result.status >= 200 && result.status < 300) ||
    [301, 302, 303, 307, 308].includes(result.status) ||
    result.finalUrl.includes('/auth/login') ||
    result.location?.includes('/auth/login') === true
  )
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      redirect: 'manual',
      signal: controller.signal
    })
  } finally {
    clearTimeout(timer)
  }
}

async function checkRoute(check: RouteCheck): Promise<FetchResult> {
  const startedAt = Date.now()
  try {
    const response = await fetchWithTimeout(check.url)
    const result: FetchResult = {
      ...check,
      ok: false,
      status: response.status,
      finalUrl: response.url,
      location: response.headers.get('location'),
      ms: Date.now() - startedAt
    }

    result.ok = isFetchOk(result)
    return result
  } catch (error) {
    return {
      ...check,
      ok: false,
      status: 0,
      finalUrl: check.url,
      location: null,
      ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

async function checkBrowserUrl(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  url: string
) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 }
  })
  const pageErrors: string[] = []
  const consoleErrors: string[] = []

  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  try {
    const response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: timeoutMs
    })
    const desktopOverflowX = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(100)
    const mobileOverflowX = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
    const title = await page.title()
    const textSample = (
      await page
        .locator('body')
        .innerText()
        .catch(() => '')
    )
      .replace(/\s+/g, ' ')
      .slice(0, 360)
    const status = response?.status() ?? null
    const result: BrowserResult = {
      url,
      status,
      finalUrl: page.url(),
      title,
      textSample,
      desktopOverflowX,
      mobileOverflowX,
      pageErrors,
      consoleErrors,
      ok:
        (status === null || status < 500) &&
        desktopOverflowX <= 2 &&
        mobileOverflowX <= 2 &&
        pageErrors.length === 0 &&
        consoleErrors.length === 0
    }

    return result
  } catch (error) {
    return {
      url,
      status: null,
      finalUrl: page.url(),
      title: '',
      textSample: '',
      desktopOverflowX: 0,
      mobileOverflowX: 0,
      pageErrors,
      consoleErrors,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }
  } finally {
    await page.close()
  }
}

async function checkBrowser() {
  const browser = await chromium.launch({ headless: true })
  try {
    const results: BrowserResult[] = []
    for (const url of browserUrls) {
      results.push(await checkBrowserUrl(browser, url))
    }
    return results
  } finally {
    await browser.close()
  }
}

async function checkRailway(): Promise<RailwayResult> {
  if (!runRailway) return { ok: true, status: 'skipped' }

  try {
    const { stdout } = await execFileAsync(
      'railway',
      [
        'deployment',
        'list',
        '--service',
        'brok',
        '--environment',
        'production',
        '--json'
      ],
      {
        env: {
          ...process.env,
          PATH: `/opt/homebrew/bin:${process.env.HOME}/.bun/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.PATH ?? ''}`
        },
        timeout: timeoutMs
      }
    )
    const deployments = JSON.parse(stdout) as Array<{
      id?: string
      status?: string
    }>
    const latest = deployments[0]
    return {
      ok: latest?.status === 'SUCCESS',
      status: latest?.status ?? 'unknown',
      deploymentId: latest?.id,
      service: 'brok'
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

function markdownTable(headers: string[], rows: string[][]) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.join(' | ')} |`)
  ].join('\n')
}

function renderMarkdown(report: {
  checkedAt: string
  baseUrl: string
  docsUrl: string
  railway: RailwayResult
  routes: FetchResult[]
  browser: BrowserResult[]
}) {
  const routeRows = report.routes.map(result => [
    result.ok ? 'pass' : 'fail',
    result.label,
    String(result.status),
    `${result.ms}ms`,
    result.location ?? result.finalUrl,
    result.error ?? ''
  ])
  const browserRows = report.browser.map(result => [
    result.ok ? 'pass' : 'fail',
    result.url,
    String(result.status ?? 'n/a'),
    String(result.desktopOverflowX),
    String(result.mobileOverflowX),
    [...result.pageErrors, ...result.consoleErrors, result.error]
      .filter(Boolean)
      .join('; ')
      .slice(0, 240)
  ])
  const failures = [
    ...report.routes
      .filter(result => !result.ok)
      .map(
        result =>
          `${result.label}: status ${result.status} ${result.error ?? ''}`
      ),
    ...report.browser
      .filter(result => !result.ok)
      .map(result => `${result.url}: browser issue ${result.error ?? ''}`),
    ...(report.railway.ok
      ? []
      : [
          `Railway brok deployment: ${report.railway.status ?? report.railway.error}`
        ])
  ]

  return [
    `# Brok platform audit`,
    ``,
    `Checked: ${report.checkedAt}`,
    `Base: ${report.baseUrl}`,
    `Docs: ${report.docsUrl}`,
    ``,
    `## Railway`,
    ``,
    `- Status: ${report.railway.status ?? 'unknown'}`,
    `- Deployment: ${report.railway.deploymentId ?? 'n/a'}`,
    `- OK: ${report.railway.ok ? 'yes' : 'no'}`,
    ``,
    `## Route health`,
    ``,
    markdownTable(
      ['OK', 'Route', 'Status', 'Latency', 'Location/final URL', 'Error'],
      routeRows
    ),
    ``,
    `## Browser UI health`,
    ``,
    markdownTable(
      ['OK', 'URL', 'Status', 'Desktop overflow', 'Mobile overflow', 'Errors'],
      browserRows
    ),
    ``,
    `## Next fixes`,
    ``,
    failures.length > 0
      ? failures.map(failure => `- ${failure}`).join('\n')
      : '- No hard failures in this audit pass.',
    ``,
    `## Product bar`,
    ``,
    `Use the buildspace-style reference as a visual bar where appropriate: high-contrast, cinematic, sparse, emotionally direct, with one clear primary action and no clutter. Apply it intentionally to landing/onboarding moments, while keeping operational tools like BrokMail and BrokCode dense enough for repeated work.`
  ].join('\n')
}

async function main() {
  const checkedAt = new Date().toISOString()
  await mkdir(outputDir, { recursive: true })

  const [routes, browser, railway] = await Promise.all([
    Promise.all(routeChecks.map(checkRoute)),
    checkBrowser(),
    checkRailway()
  ])

  const report = {
    checkedAt,
    baseUrl,
    docsUrl,
    railway,
    routes,
    browser
  }
  const fileStamp = stampForFile(new Date(checkedAt))
  const jsonPath = path.join(outputDir, `${fileStamp}.json`)
  const mdPath = path.join(outputDir, `${fileStamp}.md`)
  const latestPath = path.join(outputDir, 'latest.md')
  const markdown = renderMarkdown(report)

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(mdPath, `${markdown}\n`, 'utf8')
  await writeFile(latestPath, `${markdown}\n`, 'utf8')

  console.log(`brok audit wrote ${mdPath}`)

  const hardFailures = [
    ...routes.filter(result => !result.ok),
    ...browser.filter(result => !result.ok),
    ...(railway.ok ? [] : [railway])
  ]

  if (hardFailures.length > 0) {
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
