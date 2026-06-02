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

async function check(page, path, width) {
  await page.setViewportSize({
    width,
    height: Math.max(700, Math.round(width * 2.2))
  })
  const response = await page
    .goto(`${BASE_URL}${path}`, {
      waitUntil: 'domcontentloaded'
    })
    .catch(() => null)
  const status = response?.status?.() ?? 0
  const title = await page.title().catch(() => '')
  const metrics = await page.evaluate(() => {
    const body = document.body
    const doc = document.documentElement
    return {
      overflow: Math.max(body.scrollWidth, doc.scrollWidth) - window.innerWidth
    }
  })

  return {
    path,
    status,
    title,
    width,
    overflow: metrics.overflow
  }
}

const browser = await chromium.launch({ headless: true })
const results = []
for (const route of routes) {
  for (const width of [320, 390, 430, 768]) {
    const page = await browser.newPage()
    const row = await check(page, route, width)
    const ok =
      row.overflow <= 0 &&
      (row.status === 0 || (row.status >= 200 && row.status < 400))
    console.log(
      `${ok ? 'OK' : 'BAD'} ${route.padEnd(24)} w=${width} status=${row.status} overflow=${row.overflow} title=${row.title}`
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
