import { access, mkdir, writeFile } from 'node:fs/promises'
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
const searchTimeoutMs = Number(
  process.env.BROK_SMOKE_SEARCH_TIMEOUT_MS || 60000
)
const searchQuery =
  process.env.BROK_SMOKE_SEARCH_QUERY ||
  'What is Brok search? Answer in one short paragraph.'
const searchMode = process.env.BROK_SMOKE_SEARCH_MODE || 'quick'

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

type SearchSmokeResult = {
  status:
    | 'ok'
    | 'skipped_no_auth'
    | 'auth_required'
    | 'search_ui_failed'
    | 'error'
  query: string
  mode: string
  startUrl: string
  finalUrl: string
  durableState: 'url' | 'answer_reload' | 'not_verified'
  progressSeen: boolean
  answerPreview: string
  sourceCount: number
  followUpFormSeen: boolean
  followUpChipsSeen: boolean
  consoleErrors: string[]
  failedRequests: string[]
  pageErrors: string[]
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

function searchUrl() {
  const params = new URLSearchParams()
  params.set('q', searchQuery)
  params.set('mode', searchMode)
  return routeUrl(`/search?${params.toString()}`)
}

function hasAuthInput() {
  return Boolean(authStatePath || (smokeEmail && smokePassword))
}

function isAuthUrl(value: string) {
  return /\/auth|\/login|\/signin|\/sign-in/.test(value)
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function previewText(value: string, length = 220) {
  return normalizeText(value).slice(0, length)
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

async function installSearchPaintObserver(page: Page) {
  await page.addInitScript(() => {
    const selectors = [
      '[data-testid="search-progress"]',
      '[data-testid="brok-answer-loading-card"]',
      '[data-testid="brok-search-source-0"]',
      '[data-testid="brok-search-answer"]',
      '[data-testid="brok-follow-up-form"]'
    ] as const
    const seen = new Set<string>()

    function isVisible(element: Element | null) {
      if (!(element instanceof HTMLElement)) return false

      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()

      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) > 0 &&
        rect.width > 0 &&
        rect.height > 0
      )
    }

    function check() {
      for (const selector of selectors) {
        if (
          !seen.has(selector) &&
          isVisible(document.querySelector(selector))
        ) {
          seen.add(selector)
        }
      }
    }

    function start() {
      check()
      const observer = new MutationObserver(check)
      observer.observe(document.documentElement, {
        attributes: true,
        childList: true,
        subtree: true
      })
      window.addEventListener('pagehide', () => observer.disconnect(), {
        once: true
      })
    }

    if (document.documentElement) {
      start()
    } else {
      window.addEventListener('DOMContentLoaded', start, { once: true })
    }

    ;(
      window as typeof window & { __brokSearchSmokeSeen?: string[] }
    ).__brokSearchSmokeSeen = Array.from(seen)
    window.setInterval(() => {
      ;(
        window as typeof window & { __brokSearchSmokeSeen?: string[] }
      ).__brokSearchSmokeSeen = Array.from(seen)
    }, 250)
  })
}

async function hasSeenSearchSelector(page: Page, selector: string) {
  return page.evaluate(
    value =>
      (
        (window as typeof window & { __brokSearchSmokeSeen?: string[] })
          .__brokSearchSmokeSeen ?? []
      ).includes(value),
    selector
  )
}

async function assertNoSearchBrowserFailures(result: {
  consoleErrors: string[]
  failedRequests: string[]
  pageErrors: string[]
}) {
  const failedFetchConsoleErrors = result.consoleErrors.filter(message =>
    /failed to fetch/i.test(message)
  )

  if (
    result.pageErrors.length > 0 ||
    result.failedRequests.length > 0 ||
    failedFetchConsoleErrors.length > 0
  ) {
    throw new Error(
      [
        ...result.pageErrors.map(message => `page error: ${message}`),
        ...result.failedRequests.map(message => `request failed: ${message}`),
        ...failedFetchConsoleErrors.map(message => `console: ${message}`)
      ].join('; ')
    )
  }
}

async function collectSearchSmoke(
  page: Page,
  runDir: string
): Promise<SearchSmokeResult> {
  const consoleErrors: string[] = []
  const failedRequests: string[] = []
  const pageErrors: string[] = []
  const startUrl = searchUrl()
  const screenshotPath = path.join(runDir, 'search-desktop.png')
  const baseResult = {
    query: searchQuery,
    mode: searchMode,
    startUrl,
    finalUrl: '',
    durableState: 'not_verified' as const,
    progressSeen: false,
    answerPreview: '',
    sourceCount: 0,
    followUpFormSeen: false,
    followUpChipsSeen: false,
    consoleErrors,
    failedRequests,
    pageErrors,
    screenshot: writeScreenshots ? screenshotPath : undefined
  }

  if (!hasAuthInput()) {
    return {
      ...baseResult,
      status: 'skipped_no_auth',
      error:
        'Authenticated /search smoke skipped: set BROK_AUTH_STATE_PATH or both BROK_SMOKE_EMAIL and BROK_SMOKE_PASSWORD.'
    }
  }

  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('requestfailed', request => {
    if (!['document', 'fetch', 'xhr'].includes(request.resourceType())) return

    const failureText = request.failure()?.errorText ?? 'unknown failure'
    if (/ERR_ABORTED/i.test(failureText)) return

    failedRequests.push(`${request.method()} ${request.url()} ${failureText}`)
  })

  try {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await installSearchPaintObserver(page)
    await page.goto(startUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs
    })
    await page
      .waitForLoadState('networkidle', { timeout: timeoutMs })
      .catch(() => {})

    if (isAuthUrl(page.url())) {
      if (writeScreenshots) await page.screenshot({ path: screenshotPath })
      return {
        ...baseResult,
        status: 'auth_required',
        finalUrl: page.url(),
        error:
          'Authenticated /search smoke redirected to auth. The supplied auth state or credentials did not produce a signed-in session.'
      }
    }

    await page.getByTestId('brok-search-client').waitFor({ timeout: timeoutMs })

    await page.waitForFunction(
      () =>
        (
          (window as typeof window & { __brokSearchSmokeSeen?: string[] })
            .__brokSearchSmokeSeen ?? []
        ).includes('[data-testid="search-progress"]'),
      undefined,
      { timeout: timeoutMs }
    )

    const progressSeen = await hasSeenSearchSelector(
      page,
      '[data-testid="search-progress"]'
    )

    const sourceCard = page.getByTestId('brok-search-source-0')
    await sourceCard.waitFor({ timeout: searchTimeoutMs })

    const answer = page.getByTestId('brok-search-answer')
    await answer.waitFor({ timeout: searchTimeoutMs })
    await page.waitForFunction(
      () =>
        ((
          document.querySelector(
            '[data-testid="brok-search-answer"]'
          ) as HTMLElement | null
        )?.innerText.trim().length ?? 0) >= 20,
      undefined,
      { timeout: timeoutMs }
    )

    const errorBanner = page.getByTestId('brok-search-error')
    if (await errorBanner.isVisible().catch(() => false)) {
      throw new Error(
        `search UI showed error: ${previewText((await errorBanner.innerText()) ?? '')}`
      )
    }

    const followUpForm = page.getByTestId('brok-follow-up-form')
    await followUpForm.waitFor({ timeout: timeoutMs })

    const answerText = normalizeText(await answer.innerText())
    const sourceCount = await page.getByTestId(/^brok-search-source-/).count()
    const followUpChipsSeen = await page
      .getByTestId('follow-up-chips')
      .isVisible()
      .catch(() => false)

    if (writeScreenshots) await page.screenshot({ path: screenshotPath })

    let durableState: SearchSmokeResult['durableState'] = 'not_verified'
    if (/\/search\/search_[a-f0-9]+/.test(page.url())) {
      durableState = 'url'
    } else {
      const answerNeedle = answerText.slice(0, 80)
      await page.reload({ waitUntil: 'domcontentloaded', timeout: timeoutMs })
      await page
        .getByTestId('brok-search-answer')
        .waitFor({ timeout: searchTimeoutMs })
      const reloadedAnswer = normalizeText(
        await page.getByTestId('brok-search-answer').innerText()
      )
      if (answerNeedle && reloadedAnswer.includes(answerNeedle)) {
        durableState = 'answer_reload'
      }
    }

    await assertNoSearchBrowserFailures({
      consoleErrors,
      failedRequests,
      pageErrors
    })

    if (!progressSeen) {
      throw new Error('search progress UI was not observed before completion')
    }

    if (sourceCount < 1) {
      throw new Error('expected at least one visible search source card')
    }

    if (durableState === 'not_verified') {
      throw new Error(
        'expected durable /search/search_... URL or answer to survive reload'
      )
    }

    return {
      ...baseResult,
      status: 'ok',
      finalUrl: page.url(),
      durableState,
      progressSeen,
      answerPreview: previewText(answerText),
      sourceCount,
      followUpFormSeen: true,
      followUpChipsSeen
    }
  } catch (error) {
    if (writeScreenshots) {
      await page.screenshot({ path: screenshotPath }).catch(() => {})
    }

    return {
      ...baseResult,
      status: 'search_ui_failed',
      finalUrl: page.url(),
      progressSeen: await hasSeenSearchSelector(
        page,
        '[data-testid="search-progress"]'
      ).catch(() => false),
      sourceCount: await page
        .getByTestId(/^brok-search-source-/)
        .count()
        .catch(() => 0),
      followUpFormSeen: await page
        .getByTestId('brok-follow-up-form')
        .isVisible()
        .catch(() => false),
      followUpChipsSeen: await page
        .getByTestId('follow-up-chips')
        .isVisible()
        .catch(() => false),
      answerPreview: await page
        .getByTestId('brok-search-answer')
        .innerText()
        .then(text => previewText(text))
        .catch(() => ''),
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
  search: SearchSmokeResult
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

  const searchNotes = [
    report.search.error,
    ...report.search.pageErrors.map(message => `page error: ${message}`),
    ...report.search.failedRequests.map(
      message => `request failed: ${message}`
    ),
    ...report.search.consoleErrors
      .filter(message => /failed to fetch/i.test(message))
      .map(message => `console: ${message}`)
  ]
    .filter(Boolean)
    .join('; ')
    .slice(0, 320)

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
    '## Signed-in search',
    '',
    '| Status | Query | Mode | Final URL | Durable state | Progress | Sources | Follow-up form | Follow-up chips | Notes |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    `| ${report.search.status} | ${report.search.query.replace(/\n/g, ' ')} | ${report.search.mode} | ${report.search.finalUrl || report.search.startUrl} | ${report.search.durableState} | ${report.search.progressSeen ? 'yes' : 'no'} | ${report.search.sourceCount} | ${report.search.followUpFormSeen ? 'yes' : 'no'} | ${report.search.followUpChipsSeen ? 'yes' : 'no'} | ${searchNotes} |`,
    '',
    '## How to run authenticated',
    '',
    '- Preferred: set `BROK_AUTH_STATE_PATH=/absolute/path/to/storage-state.json` from a signed-in Playwright session.',
    '- Alternative: set `BROK_SMOKE_EMAIL` and `BROK_SMOKE_PASSWORD` in the shell only.',
    '- Set `BROK_SMOKE_REQUIRE_AUTH=true` in CI or release gates so protected-route login redirects fail the run.',
    '- Signed-in `/search` coverage runs only when auth input is provided. Tune it with `BROK_SMOKE_SEARCH_QUERY`, `BROK_SMOKE_SEARCH_MODE`, and `BROK_SMOKE_SEARCH_TIMEOUT_MS`.'
  ].join('\n')
}

async function main() {
  const checkedAt = new Date().toISOString()
  const runDir = path.join(outputRoot, stampForFile(new Date(checkedAt)))
  await mkdir(runDir, { recursive: true })

  const contextOptions: BrowserContextOptions = {}
  if (authStatePath) {
    await access(authStatePath).catch(() => {
      throw new Error(
        `BROK_AUTH_STATE_PATH does not exist or is not readable: ${authStatePath}`
      )
    })
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

    const searchPage = await context.newPage()
    const search = await collectSearchSmoke(searchPage, runDir)
    await searchPage.close()

    const report = {
      checkedAt,
      baseUrl,
      authMode,
      requireAuth,
      results,
      search
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
    const searchFailure =
      search.status !== 'ok' &&
      (search.status !== 'skipped_no_auth' || requireAuth)

    console.log(`authenticated platform smoke wrote ${runDir}`)
    console.log(
      `checked ${results.length} route/viewports; auth_required=${authFailures.length}; hard_failures=${hardFailures.length}`
    )
    console.log(
      `signed-in search: ${search.status}; durable=${search.durableState}; sources=${search.sourceCount}; ${search.error ?? 'ok'}`
    )

    if (
      hardFailures.length > 0 ||
      (requireAuth && authFailures.length > 0) ||
      (requireAuth && !hasAuthInput()) ||
      searchFailure
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
