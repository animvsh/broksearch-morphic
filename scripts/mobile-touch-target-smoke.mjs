import { chromium } from 'playwright'

const BASE_URL = process.env.BROWSER_BASE_URL || 'http://127.0.0.1:3000'
const MIN_TOUCH_TARGET = 44
const routes = [
  '/',
  '/search',
  '/features',
  '/features/brokcode',
  '/features/brokmail',
  '/features/presentations',
  '/features/api',
  '/pricing',
  '/docs',
  '/docs/brokcode',
  '/docs/brokmail',
  '/integrations',
  '/presentations',
  '/brokcode',
  '/brokcode/tui',
  '/brokmail',
  '/playground',
  '/billing',
  '/settings',
  '/admin'
]

async function checkRoute(page, path, attempt = 0) {
  await page.setViewportSize({ width: 390, height: 844 })
  let response
  try {
    response = await page.goto(`${BASE_URL}${path}`, {
      waitUntil: 'domcontentloaded'
    })
  } catch (error) {
    if (attempt < 2) {
      await page.waitForTimeout(250)
      return checkRoute(page, path, attempt + 1)
    }
    return {
      path,
      status: 0,
      smallControls: 0,
      smallCount: 0,
      samples: []
    }
  }
  const status = response?.status?.() ?? 0

  if (status >= 400) {
    return { path, status, smallControls: 0, smallCount: 0, samples: [] }
  }

  let smallControls = []
  try {
    smallControls = await page.$$eval(
      'a[href], button, [role="button"], input:not([type="hidden"]), select, textarea',
      nodes => {
        const rects = nodes
          .map(node => {
            const rect = node.getBoundingClientRect()
            const element = node
            const style = window.getComputedStyle(element)
            const isVisuallyHiddenMirror =
              rect.width <= 1 &&
              rect.height <= 1 &&
              !element.textContent?.trim() &&
              element.getAttribute('aria-hidden') === 'true'
            const isVisible =
              rect.width > 0 &&
              rect.height > 0 &&
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              +style.opacity > 0 &&
              element.getAttribute('aria-hidden') !== 'true' &&
              !isVisuallyHiddenMirror
            if (!isVisible) return null

            const isDisabled =
              (element instanceof HTMLInputElement &&
                element.disabled &&
                element.type !== 'text') ||
              (element instanceof HTMLButtonElement && element.disabled) ||
              (element instanceof HTMLTextAreaElement && element.disabled) ||
              (element instanceof HTMLSelectElement && element.disabled) ||
              element.getAttribute('aria-disabled') === 'true'

            return {
              tag: element.tagName.toLowerCase(),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              disabled: isDisabled,
              label: (element.textContent || '').trim().slice(0, 40),
              type:
                element instanceof HTMLInputElement ? element.type : undefined
            }
          })
          .filter(Boolean)

        return rects.filter(item => item && !item.disabled)
      }
    )
  } catch (error) {
    if (
      attempt < 2 &&
      String(error).includes('Execution context was destroyed')
    ) {
      await page.waitForTimeout(200)
      return await checkRoute(page, path, attempt + 1)
    }
    throw error
  }

  const undersized = smallControls.filter(
    control =>
      control.width < MIN_TOUCH_TARGET || control.height < MIN_TOUCH_TARGET
  )

  return {
    path,
    status,
    smallControls: smallControls.length,
    smallCount: undersized.length,
    samples: undersized.slice(0, 12)
  }
}

const browser = await chromium.launch({ headless: true })
const results = []

for (const path of routes) {
  const page = await browser.newPage()
  const result = await checkRoute(page, path)
  console.log(
    `CHECK ${result.path} status=${result.status} controls=${result.smallControls} undersized=${result.smallCount}`
  )
  if (result.smallCount > 0) {
    console.log(`  undersized examples: ${JSON.stringify(result.samples)}`)
  }
  results.push(result)
  await page.close()
}

await browser.close()

const bad = results.filter(
  result => result.status < 200 || result.status >= 400 || result.smallCount > 0
)
if (bad.length > 0) {
  console.error(
    `touch-target-smoke found ${bad.length} routes with failed loads or undersized controls`
  )
  process.exit(1)
}
