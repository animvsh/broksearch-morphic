const { chromium } = require('playwright')

const BASE_URL = process.env.BROWSER_BASE_URL ?? 'http://localhost:3000'

const checks = [
  ['/', [], 390],
  ['/pricing', [], 390],
  ['/features', [], 390],
  ['/features/search', [], 390],
  ['/features/brokcode', [], 390],
  ['/features/brokmail', [], 390],
  ['/features/presentations', [], 390],
  ['/features/api', [], 390],
  ['/docs', [], 390],
  ['/docs/quickstart', [], 390],
  ['/docs/brokcode', ['terminal tui'], 390],
  ['/docs/brokmail', ['/api/brokmail/gcal/events'], 390],
  ['/tools', [], 390],
  ['/auth/login', [], 390],
  ['/pricing', [], 768],
  ['/features', [], 768],
  ['/docs', [], 768],
  ['/docs/brokcode', ['terminal tui'], 768],
  ['/docs/brokmail', ['/api/brokmail/gcal/events'], 768],
  ['/features/brokcode', [], 768],
  ['/features/presentations', [], 768]
]

async function checkRoute(page, path, terms) {
  const consoleErrors = []
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  const response = await page.goto(`${BASE_URL}${path}`, {
    waitUntil: 'domcontentloaded',
    timeout: 20000
  })

  await page.waitForTimeout(500)

  const metrics = await page.evaluate(() => ({
    url: window.location.href,
    scrollWidth: Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth
    ),
    innerWidth: window.innerWidth,
    hasNoScroll:
      document.documentElement.scrollHeight <= window.innerHeight + 2 ||
      document.body.scrollHeight <= window.innerHeight + 2
  }))

  const text = (
    await page
      .locator('body')
      .innerText()
      .catch(() => '')
  ).toLowerCase()
  const missing = terms.filter(term => !text.includes(term.toLowerCase()))

  return {
    status: response?.status() ?? null,
    redirect: page.url(),
    overflow: metrics.scrollWidth - metrics.innerWidth,
    noVerticalOverflow: metrics.hasNoScroll,
    missing,
    consoleErrors
  }
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const out = []

  for (const [path, terms, width] of checks) {
    const page = await browser.newPage({
      viewport: { width, height: Math.max(720, width + 420) }
    })

    const result = {
      path,
      width,
      ok: false,
      status: null,
      redirect: null,
      overflow: 0,
      missing: [],
      consoleErrors: 0,
      errors: []
    }

    try {
      const data = await checkRoute(page, path, terms)
      result.status = data.status
      result.redirect = data.redirect
      result.overflow = data.overflow
      result.missing = data.missing
      result.consoleErrors = data.consoleErrors.length
      result.ok =
        result.overflow <= 0 &&
        Number(result.status) >= 200 &&
        Number(result.status) < 400
    } catch (error) {
      result.errors = [String(error)]
    } finally {
      await page.close()
      out.push(result)
    }

    console.log(
      `${result.ok ? 'OK' : 'BAD'} ${result.path} w=${result.width} overflow=${result.overflow} status=${result.status}`
    )
    if (result.missing.length > 0) {
      console.log(`  missing: ${result.missing.join(' | ')}`)
    }
    if (result.errors.length > 0) {
      console.log(`  error: ${result.errors[0]}`)
    }
    if (result.consoleErrors) {
      console.log(`  console errors: ${result.consoleErrors}`)
    }
  }

  await browser.close()

  const failed = out.filter(item => !item.ok)
  process.exit(failed.length > 0 ? 1 : 0)
})()
