import { chromium } from 'playwright'

const BASE_URL = process.env.BROWSER_BASE_URL || 'http://127.0.0.1:3000'
const NAVIGATION_TIMEOUT_MS = Math.max(
  30_000,
  Number(process.env.MOBILE_SMOKE_NAV_TIMEOUT_MS) || 60_000
)
const RETRYABLE_NAVIGATION_ERROR =
  /ERR_NETWORK_|Execution context was destroyed|page crashed|Timeout|Load failed|ERR_|ECONN|chrome-error:\/\/chromewebdata|interrupted by another navigation|Target page, context or browser has been closed/i
const routes = [
  '/',
  '/search',
  '/discover',
  '/library',
  '/spaces',
  '/features',
  '/features/search',
  '/features/brokcode',
  '/features/brokmail',
  '/features/presentations',
  '/features/api',
  '/docs',
  '/docs/quickstart',
  '/docs/api-keys',
  '/docs/search-completions',
  '/docs/brokcode',
  '/docs/brokmail',
  '/pricing',
  '/tools',
  '/tools/humanizer',
  '/integrations',
  '/presentations',
  '/brokmail',
  '/brokcode',
  '/brokcode/tui',
  '/brokcode/shared',
  '/api-keys',
  '/api-keys/new',
  '/usage',
  '/billing',
  '/settings',
  '/dashboard',
  '/admin',
  '/admin/brok',
  '/admin/health',
  '/admin/brok/logs',
  '/admin/api',
  '/admin/models',
  '/admin/brok/providers',
  '/admin/providers',
  '/admin/costs',
  '/admin/projects',
  '/team',
  '/playground'
]

async function check(page, path, width, attempt = 0) {
  await page.setViewportSize({
    width,
    height: Math.max(700, Math.round(width * 2.2))
  })

  let response
  let navigationError = ''
  try {
    response = await page.goto(`${BASE_URL}${path}`, {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT_MS
    })
  } catch (error) {
    navigationError = error instanceof Error ? error.message : String(error)
    if (attempt < 3 && RETRYABLE_NAVIGATION_ERROR.test(navigationError)) {
      await page.waitForTimeout(500 * attempt)
      return check(page, path, width, attempt + 1)
    }
    return {
      path,
      status: 0,
      title: '',
      width,
      overflow: 0,
      error: navigationError
    }
  }

  const status = response?.status?.() ?? 0
  let title = ''
  let metrics
  try {
    await page.waitForTimeout(300)
    title = await page.title().catch(() => '')
    metrics = await page.evaluate(() => {
      const body = document.body
      const doc = document.documentElement
      return {
        overflow:
          Math.max(body.scrollWidth, doc.scrollWidth) - window.innerWidth
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (
      attempt < 2 &&
      /Execution context was destroyed|Cannot read properties of null|Execution context is not available/i.test(
        message
      )
    ) {
      await page.waitForTimeout(250)
      return check(page, path, width, attempt + 1)
    }
    return {
      path,
      status,
      title,
      width,
      overflow: 0,
      error: message
    }
  }

  return {
    path,
    status,
    title,
    width,
    overflow: metrics.overflow,
    error: navigationError
  }
}

const browser = await chromium.launch({ headless: true })
const results = []
for (const route of routes) {
  for (const width of [320, 390, 430, 768]) {
    const page = await browser.newPage()
    const row = await check(page, route, width)
    const ok = row.overflow <= 0 && row.status >= 200 && row.status < 400
    console.log(
      `${ok ? 'OK' : 'BAD'} ${route.padEnd(24)} w=${width} status=${row.status} overflow=${row.overflow} title=${row.title}${row.error ? ` error=${row.error}` : ''}`
    )
    results.push({ ...row, ok })
    await page.close()
  }
}
await browser.close()

const bad = results.filter(result => !result.ok)
console.log(`\nchecked=${results.length} bad=${bad.length}`)
if (bad.length > 0) {
  console.error(JSON.stringify(bad, null, 2))
  process.exit(1)
}
