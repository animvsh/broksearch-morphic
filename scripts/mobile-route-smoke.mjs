import { chromium } from 'playwright'

const BASE_URL = process.env.BROWSER_BASE_URL || 'http://127.0.0.1:3000'
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
  '/pricing',
  '/tools',
  '/tools/humanizer',
  '/integrations',
  '/presentations',
  '/brokmail',
  '/brokcode',
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
  let navigationError = ''
  const response = await page
    .goto(`${BASE_URL}${path}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    })
    .catch(async error => {
      navigationError = error instanceof Error ? error.message : String(error)
      if (attempt < 2) {
        await page.waitForTimeout(500)
      }
      return null
    })

  if (!response && attempt < 2) {
    return check(page, path, width, attempt + 1)
  }

  const status = response?.status?.() ?? 0
  const title = await page.title().catch(() => '')
  let metrics
  try {
    metrics = await page.evaluate(() => {
      const body = document.body
      const doc = document.documentElement
      return {
        overflow:
          Math.max(body.scrollWidth, doc.scrollWidth) - window.innerWidth
      }
    })
  } catch (error) {
    if (
      attempt < 2 &&
      String(error).includes('Execution context was destroyed')
    ) {
      await page.waitForTimeout(250)
      return check(page, path, width, attempt + 1)
    }
    throw error
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
