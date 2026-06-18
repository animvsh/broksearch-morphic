import { chromium, type Page } from 'playwright'

const baseUrl = (process.env.SMOKE_BASE_URL || 'http://localhost:3001').replace(
  /\/+$/,
  ''
)
const demoPath = '/search/demo'
const customQuery = 'Can Broksearch explain demo honesty?'
const customFollowUpQuery = `What sources would Brok need for "${customQuery}"`

function fail(message: string): never {
  throw new Error(`[smoke:search-demo] ${message}`)
}

async function assert(condition: unknown, message: string) {
  if (!condition) fail(message)
}

async function ensureServerAvailable() {
  try {
    const response = await fetch(`${baseUrl}${demoPath}`, {
      redirect: 'manual'
    })
    if (response.status >= 500) {
      fail(
        `${baseUrl}${demoPath} responded ${response.status}; local dev server is not healthy.`
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    fail(
      `${baseUrl} is not reachable. Start a local dev server first, or set SMOKE_BASE_URL to an already-running Brok Search app. (${message})`
    )
  }
}

async function assertPublicDemoLoaded(page: Page) {
  const authRedirected =
    /\/auth|\/login|\/signin|\/sign-in/.test(page.url()) ||
    (await page
      .getByText(/sign in|log in|authentication required/i)
      .first()
      .isVisible()
      .catch(() => false))

  if (authRedirected) {
    fail(`public demo redirected to auth. Current URL: ${page.url()}`)
  }

  await assert(
    page.url().includes(demoPath),
    `expected to stay on ${demoPath}, got ${page.url()}`
  )
  await page
    .getByRole('heading', { name: 'Ask Broksearch' })
    .waitFor({ timeout: 20_000 })
  await page.waitForLoadState('networkidle')
  await page.getByText('Public demo', { exact: true }).waitFor({
    timeout: 10_000
  })
  await page.getByText('No login required', { exact: true }).waitFor({
    timeout: 10_000
  })
}

async function assertInitialDemoState(page: Page) {
  const initialQuery =
    'What are the latest advances in fusion energy as of 2026?'

  await assert(
    await page
      .getByText(
        'Static demo content. No live web search is being performed.',
        {
          exact: true
        }
      )
      .isVisible(),
    'expected initial static demo status'
  )
  await assert(
    (await page.getByLabel('Demo search query').inputValue()) === initialQuery,
    'expected initial query in search box'
  )
  await assert(
    await page
      .locator('p')
      .filter({ hasText: initialQuery })
      .first()
      .isVisible(),
    'expected initial demo query'
  )
  await assert(
    await page.getByText(/Fusion energy has had a remarkable/i).isVisible(),
    'expected initial demo answer'
  )
  await assert(
    await page.getByRole('button', { name: /Collapse 4 sources/i }).isVisible(),
    'expected expanded source panel'
  )
  await assert(
    await page
      .getByRole('button', { name: 'Fusion power - Wikipedia', exact: true })
      .isVisible(),
    'expected initial source card'
  )
  await assert(
    await page
      .getByRole('button', {
        name: /Compare the leading private fusion companies/i
      })
      .isVisible(),
    'expected initial follow-up suggestions'
  )
}

async function runCustomSearch(page: Page) {
  await page.getByLabel('Demo search query').fill(customQuery)
  await page.getByRole('button', { name: 'Search' }).click()

  await page
    .getByText('Preparing a static demo answer...', { exact: true })
    .waitFor({ timeout: 5_000 })
  await page
    .getByText(
      'Demo answer loaded from static content. Sources are illustrative.',
      {
        exact: true
      }
    )
    .waitFor({ timeout: 10_000 })

  await assert(
    (await page.getByLabel('Demo search query').inputValue()) === customQuery,
    'expected custom query in search box'
  )
  await assert(
    await page
      .locator('p')
      .filter({ hasText: customQuery })
      .first()
      .isVisible(),
    'expected custom query echo'
  )
  await assert(
    await page
      .getByText(`This is a static demo response for "${customQuery}".`)
      .isVisible(),
    'expected custom static demo answer'
  )
  await assert(
    await page
      .getByRole('button', { name: 'Fusion power - Wikipedia', exact: true })
      .isVisible(),
    'expected illustrative sources to remain visible after custom query'
  )
  await assert(
    await page
      .locator('button')
      .filter({ hasText: customFollowUpQuery })
      .first()
      .isVisible(),
    'expected custom follow-up suggestions'
  )
}

async function assertFollowUpBehavior(page: Page) {
  const followUpQuery = customFollowUpQuery

  await page.locator('button').filter({ hasText: followUpQuery }).click()
  await page
    .getByText('Loading follow-up demo answer...', { exact: true })
    .waitFor({ timeout: 5_000 })
  await page
    .getByText(
      'Demo answer loaded from static content. Sources are illustrative.',
      {
        exact: true
      }
    )
    .waitFor({ timeout: 10_000 })

  await assert(
    (await page.getByLabel('Demo search query').inputValue()) === followUpQuery,
    'expected clicked follow-up in search box'
  )
  await assert(
    await page
      .locator('p')
      .filter({ hasText: followUpQuery })
      .first()
      .isVisible(),
    'expected clicked follow-up to become active query'
  )
  await assert(
    await page
      .getByText(`This is a static demo response for "${followUpQuery}".`)
      .isVisible(),
    'expected fallback answer for clicked follow-up'
  )
  await assert(
    await page
      .getByText(/Compare quick and deep search modes for/i)
      .isVisible(),
    'expected follow-up suggestions to refresh for active follow-up query'
  )
}

async function assertShareDisabled(page: Page) {
  await page.getByRole('button', { name: 'Share' }).click()
  await page
    .getByText('Share is disabled in this public static demo.', { exact: true })
    .waitFor({ timeout: 5_000 })
}

async function main() {
  await ensureServerAvailable()

  const browser = await chromium.launch()
  const page = await browser.newPage()
  const forbiddenRequests: string[] = []

  page.on('request', request => {
    const url = new URL(request.url())
    if (
      url.pathname.startsWith('/api/search') ||
      url.pathname.startsWith('/api/auth')
    ) {
      forbiddenRequests.push(`${request.method()} ${url.pathname}`)
    }
  })

  try {
    await page.goto(`${baseUrl}${demoPath}`, { waitUntil: 'domcontentloaded' })
    await assertPublicDemoLoaded(page)
    await assertInitialDemoState(page)
    await runCustomSearch(page)
    await assertFollowUpBehavior(page)
    await assertShareDisabled(page)

    await assert(
      forbiddenRequests.length === 0,
      `expected no search/auth API requests, saw: ${forbiddenRequests.join(', ')}`
    )

    console.log(
      `[smoke:search-demo] passed against ${baseUrl}${demoPath}; no auth, secrets, or live search API calls required.`
    )
  } finally {
    await browser.close()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
