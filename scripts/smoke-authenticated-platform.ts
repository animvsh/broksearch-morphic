import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { type BrowserContextOptions, chromium, type Page } from 'playwright'

const baseUrl = normalizeOrigin(
  process.env.BROK_SMOKE_BASE_URL ||
    process.env.SMOKE_BASE_URL ||
    'https://www.brok.fyi'
)
const outputRoot =
  process.env.BROK_SMOKE_OUTPUT_DIR || '.brok-smoke/auth-platform'
const authStatePath = process.env.BROK_AUTH_STATE_PATH
const smokeEmail = process.env.BROK_SMOKE_EMAIL
const smokePassword = process.env.BROK_SMOKE_PASSWORD
const requireAuth = process.env.BROK_SMOKE_REQUIRE_AUTH === 'true'
const writeScreenshots = process.env.BROK_SMOKE_SCREENSHOTS !== 'false'
const timeoutMs = Number(process.env.BROK_SMOKE_TIMEOUT_MS || 20000)

type ProductRoute = {
  path: string
  label: string
  requiredTexts: string[]
  optionalTexts: string[]
  authenticated: boolean
  mobile: boolean
}

type Viewport = 'desktop' | 'mobile'

type RouteResult = {
  label: string
  path: string
  viewport: Viewport
  status: 'ok' | 'auth_required' | 'missing_expected_text' | 'error'
  finalUrl: string
  title: string
  foundTexts: string[]
  missingTexts: string[]
  consoleErrors: string[]
  pageErrors: string[]
  horizontalOverflow: number
  screenshot?: string
  error?: string
}

const routes: ProductRoute[] = [
  {
    path: '/',
    label: 'home',
    requiredTexts: ['Brok'],
    optionalTexts: ['Private beta', 'Search', 'Ask'],
    authenticated: false,
    mobile: true
  },
  {
    path: '/brokcode',
    label: 'brokcode',
    requiredTexts: ['Brok Code'],
    optionalTexts: ['Builder chat', 'Preview', 'Ask Brok Code', 'Deploy'],
    authenticated: true,
    mobile: true
  },
  {
    path: '/brokmail',
    label: 'brokmail',
    requiredTexts: ['BrokMail'],
    optionalTexts: ['Inbox', 'Assistant', 'Gmail', 'Calendar'],
    authenticated: true,
    mobile: true
  },
  {
    path: '/integrations',
    label: 'integrations',
    requiredTexts: ['Integrations'],
    optionalTexts: ['Gmail', 'GitHub', 'Linear', 'Google'],
    authenticated: true,
    mobile: true
  },
  {
    path: '/tools/humanizer',
    label: 'humanizer',
    requiredTexts: ['Humanizer'],
    optionalTexts: ['Humanize', 'Voice', 'AI'],
    authenticated: true,
    mobile: true
  },
  {
    path: '/usage',
    label: 'usage',
    requiredTexts: ['Usage'],
    optionalTexts: ['Requests', 'Tokens', 'Billing'],
    authenticated: true,
    mobile: false
  },
  {
    path: '/api-keys',
    label: 'api-keys',
    requiredTexts: ['API'],
    optionalTexts: ['Keys', 'Create', 'Usage'],
    authenticated: true,
    mobile: false
  },
  {
    path: '/admin/brok',
    label: 'admin',
    requiredTexts: ['Admin'],
    optionalTexts: ['Feature', 'Usage', 'Requests', 'Users'],
    authenticated: true,
    mobile: false
  }
]

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function stampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-')
}

function routeUrl(routePath: string) {
  return `${baseUrl}${routePath.startsWith('/') ? routePath : `/${routePath}`}`
}

function hasAuthInput() {
  return Boolean(authStatePath || (smokeEmail && smokePassword))
}

async function loginIfConfigured(page: Page) {
  if (!smokeEmail || !smokePassword || authStatePath) return false

  await page.goto(routeUrl('/auth/login'), {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs
  })

  const emailInput = page
    .getByLabel('Email')
    .or(page.getByPlaceholder('Email'))
    .or(page.locator('input[type="email"]'))
    .first()
  const passwordInput = page
    .getByLabel('Password')
    .or(page.getByPlaceholder('Password'))
    .or(page.locator('input[type="password"]'))
    .first()

  await emailInput.fill(smokeEmail, { timeout: timeoutMs })
  await passwordInput.fill(smokePassword, { timeout: timeoutMs })

  const submitButton = page
    .getByRole('button', { name: /sign in|log in|continue/i })
    .first()
  await Promise.all([
    page.waitForURL(url => !url.pathname.includes('/auth/login'), {
      timeout: timeoutMs
    }),
    submitButton.click()
  ])

  return true
}

async function collectRoute(
  page: Page,
  route: ProductRoute,
  viewport: Viewport,
  runDir: string
): Promise<RouteResult> {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', error => pageErrors.push(error.message))

  const screenshotPath = path.join(runDir, `${route.label}-${viewport}.png`)

  try {
    await page.setViewportSize(
      viewport === 'mobile'
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 }
    )
    const response = await page.goto(routeUrl(route.path), {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs
    })
    await page
      .waitForLoadState('networkidle', { timeout: timeoutMs })
      .catch(() => {})

    const finalUrl = page.url()
    const title = await page.title()

    if (finalUrl.includes('/auth/login')) {
      if (writeScreenshots) await page.screenshot({ path: screenshotPath })
      return {
        label: route.label,
        path: route.path,
        viewport,
        status: 'auth_required',
        finalUrl,
        title,
        foundTexts: [],
        missingTexts: route.requiredTexts,
        consoleErrors,
        pageErrors,
        horizontalOverflow: 0,
        screenshot: writeScreenshots ? screenshotPath : undefined
      }
    }

    if ((response?.status() ?? 200) >= 500) {
      throw new Error(`route returned ${response?.status()}`)
    }

    const visibleText = await page.locator('body').innerText({
      timeout: timeoutMs
    })
    const expectedTexts = [...route.requiredTexts, ...route.optionalTexts]
    const foundTexts = expectedTexts.filter(text =>
      visibleText.toLowerCase().includes(text.toLowerCase())
    )
    const missingTexts = route.requiredTexts.filter(
      text => !foundTexts.includes(text)
    )
    const horizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )

    if (writeScreenshots) await page.screenshot({ path: screenshotPath })

    return {
      label: route.label,
      path: route.path,
      viewport,
      status: missingTexts.length > 0 ? 'missing_expected_text' : 'ok',
      finalUrl,
      title,
      foundTexts,
      missingTexts,
      consoleErrors,
      pageErrors,
      horizontalOverflow,
      screenshot: writeScreenshots ? screenshotPath : undefined
    }
  } catch (error) {
    return {
      label: route.label,
      path: route.path,
      viewport,
      status: 'error',
      finalUrl: page.url(),
      title: await page.title().catch(() => ''),
      foundTexts: [],
      missingTexts: route.requiredTexts,
      consoleErrors,
      pageErrors,
      horizontalOverflow: 0,
      screenshot: undefined,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

function renderMarkdown(report: {
  checkedAt: string
  baseUrl: string
  authMode: string
  requireAuth: boolean
  results: RouteResult[]
}) {
  const rows = report.results.map(result =>
    [
      result.status,
      result.label,
      result.viewport,
      result.path,
      result.finalUrl,
      String(result.horizontalOverflow),
      result.foundTexts.join(', ') || 'none',
      [
        ...result.missingTexts.map(text => `missing ${text}`),
        ...result.pageErrors,
        ...result.consoleErrors,
        result.error
      ]
        .filter(Boolean)
        .join('; ')
        .slice(0, 240)
    ]
      .map(value => String(value).replace(/\n/g, ' '))
      .join(' | ')
  )

  return [
    '# Authenticated Brok platform smoke',
    '',
    `Checked: ${report.checkedAt}`,
    `Base URL: ${report.baseUrl}`,
    `Auth mode: ${report.authMode}`,
    `Require auth: ${report.requireAuth ? 'yes' : 'no'}`,
    '',
    '| Status | Surface | Viewport | Path | Final URL | Overflow | Found signals | Notes |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(row => `| ${row} |`),
    '',
    '## How to run authenticated',
    '',
    '- Preferred: set `BROK_AUTH_STATE_PATH=/absolute/path/to/storage-state.json` from a signed-in Playwright session.',
    '- Alternative: set `BROK_SMOKE_EMAIL` and `BROK_SMOKE_PASSWORD` in the shell only.',
    '- Set `BROK_SMOKE_REQUIRE_AUTH=true` in CI or release gates so protected-route login redirects fail the run.'
  ].join('\n')
}

async function main() {
  const checkedAt = new Date().toISOString()
  const runDir = path.join(outputRoot, stampForFile(new Date(checkedAt)))
  await mkdir(runDir, { recursive: true })

  const contextOptions: BrowserContextOptions = {}
  if (authStatePath) {
    contextOptions.storageState = authStatePath
  }

  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext(contextOptions)
    const loginPage = await context.newPage()
    const loggedIn = await loginIfConfigured(loginPage)
    await loginPage.close()

    const authMode = authStatePath
      ? `storage-state:${authStatePath}`
      : loggedIn
        ? `credentials:${smokeEmail}`
        : 'none'

    const results: RouteResult[] = []
    for (const route of routes) {
      for (const viewport of route.mobile
        ? (['desktop', 'mobile'] as const)
        : (['desktop'] as const)) {
        const page = await context.newPage()
        results.push(await collectRoute(page, route, viewport, runDir))
        await page.close()
      }
    }

    const report = {
      checkedAt,
      baseUrl,
      authMode,
      requireAuth,
      results
    }
    const markdown = renderMarkdown(report)
    await writeFile(
      path.join(runDir, 'results.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    )
    await writeFile(path.join(runDir, 'summary.md'), `${markdown}\n`, 'utf8')
    await mkdir(outputRoot, { recursive: true })
    await writeFile(path.join(outputRoot, 'latest.md'), `${markdown}\n`, 'utf8')

    const authFailures = results.filter(
      result => result.status === 'auth_required' && result.path !== '/'
    )
    const hardFailures = results.filter(
      result =>
        result.status === 'error' ||
        result.status === 'missing_expected_text' ||
        result.horizontalOverflow > 2 ||
        result.pageErrors.length > 0
    )

    console.log(`authenticated platform smoke wrote ${runDir}`)
    console.log(
      `checked ${results.length} route/viewports; auth_required=${authFailures.length}; hard_failures=${hardFailures.length}`
    )

    if (
      hardFailures.length > 0 ||
      (requireAuth && authFailures.length > 0) ||
      (requireAuth && !hasAuthInput())
    ) {
      process.exitCode = 1
    }
  } finally {
    await browser.close()
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
