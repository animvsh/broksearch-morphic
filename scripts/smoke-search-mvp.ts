import { chromium, type Page } from 'playwright'

const baseUrl = (process.env.SMOKE_BASE_URL || 'http://localhost:3001').replace(
  /\/+$/,
  ''
)
const initialQuery = 'Fixture query'
const followUpQuery = 'What should I compare next?'
const initialAnswer =
  'Fixture answer cites the primary source before offering a concise recommendation. [1]'
const followUpAnswer =
  'Use the prior fixture context to compare the strongest source against implementation risk. [1]'

type SessionSearchBody = {
  query?: unknown
  mode?: unknown
  stream?: unknown
  context?: Array<{ query?: unknown; answer?: unknown }>
}

const sessionRequests: SessionSearchBody[] = []

type FirstPaintEvent = {
  kind: 'loading' | 'result'
  selector: string
  text: string
  time: number
}

function source(title = 'Fixture Source') {
  return {
    id: 'fixture-source-1',
    title,
    url: 'https://example.com/fixture-source',
    publisher: 'example.com',
    snippet: 'A deterministic fixture source used by the browser smoke.',
    retrievedAt: '2026-06-16T00:00:00.000Z',
    qualityScore: 97
  }
}

function fail(message: string): never {
  throw new Error(`[smoke:search-mvp] ${message}`)
}

async function assert(condition: unknown, message: string) {
  if (!condition) fail(message)
}

async function ensureServerAvailable() {
  try {
    const response = await fetch(baseUrl, { redirect: 'manual' })
    if (response.status >= 500) {
      fail(
        `${baseUrl} responded ${response.status}; local dev server is not healthy.`
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    fail(
      `${baseUrl} is not reachable. Start a local dev server first, or set SMOKE_BASE_URL to an already-running Brok Search app. (${message})`
    )
  }
}

async function installRoutes(page: Page) {
  await page.exposeFunction(
    '__recordSessionSearchRequest',
    (body: SessionSearchBody) => {
      sessionRequests.push(body)
    }
  )

  await page.addInitScript(
    ({ fixtureSource, followUpAnswer, followUpQuery, initialAnswer }) => {
      const originalFetch = window.fetch.bind(window)
      const encoder = new TextEncoder()

      function sseEvent(event: string, data: unknown) {
        return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
      }

      function write(
        controller: ReadableStreamDefaultController<Uint8Array>,
        event: string,
        data: unknown
      ) {
        controller.enqueue(encoder.encode(sseEvent(event, data)))
      }

      window.fetch = async (input, init) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url
        const url = new URL(requestUrl, window.location.href)

        if (url.pathname !== '/api/search/session') {
          return originalFetch(input, init)
        }

        const rawBody =
          typeof init?.body === 'string'
            ? init.body
            : input instanceof Request
              ? await input.clone().text()
              : '{}'
        const body = JSON.parse(rawBody || '{}') as SessionSearchBody
        await (window as any).__recordSessionSearchRequest(body)

        const query = typeof body.query === 'string' ? body.query : ''
        const answer = query === followUpQuery ? followUpAnswer : initialAnswer
        let timers: number[] = []
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            timers = [
              window.setTimeout(() => {
                write(controller, 'status', {
                  id: 'fixture-session',
                  message: 'Searching web'
                })
                write(controller, 'query_resolved', {
                  id: 'fixture-session',
                  query,
                  resolved_query: query,
                  classification: {
                    type: 'fixture/smoke',
                    needsSearch: true,
                    reason: 'deterministic browser smoke'
                  },
                  search_queries: [`${query} source`],
                  answer_model: {
                    id: 'fixture-search-model',
                    name: 'Fixture Search Model',
                    providerId: 'fixture'
                  }
                })
                write(controller, 'search_started', {
                  id: 'fixture-session',
                  depth: 'lite',
                  search_queries: [`${query} source`],
                  answer_model: {
                    id: 'fixture-search-model',
                    name: 'Fixture Search Model',
                    providerId: 'fixture'
                  }
                })
              }, 25),
              window.setTimeout(() => {
                write(controller, 'source_found', {
                  id: 'fixture-session',
                  index: 1,
                  source: fixtureSource
                })
                write(controller, 'source_read', {
                  id: 'fixture-session',
                  source_id: fixtureSource.id,
                  url: fixtureSource.url,
                  title: fixtureSource.title,
                  quality_score: fixtureSource.qualityScore
                })
              }, 125),
              window.setTimeout(() => {
                write(controller, 'answer_delta', {
                  id: 'fixture-session',
                  delta: answer,
                  text: answer
                })
              }, 250),
              window.setTimeout(() => {
                const followUps = [
                  {
                    label: 'Compare fixture options',
                    query: followUpQuery
                  },
                  {
                    label: 'Find fixture risks',
                    query: 'What are the fixture risks?'
                  }
                ]
                write(controller, 'follow_ups', {
                  id: 'fixture-session',
                  items: followUps,
                  follow_ups: followUps
                })
                write(controller, 'done', {
                  id: 'fixture-session',
                  usage: {
                    search_queries: 1,
                    answer_model: {
                      id: 'fixture-search-model',
                      name: 'Fixture Search Model',
                      providerId: 'fixture'
                    },
                    total_tokens: 42
                  }
                })
                controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                controller.close()
              }, 375)
            ]
          },
          cancel() {
            timers.forEach(timer => window.clearTimeout(timer))
          }
        })

        return new Response(stream, {
          status: 200,
          headers: {
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'Content-Type': 'text/event-stream; charset=utf-8',
            'X-Brok-Request-Id': 'fixture-session'
          }
        })
      }
    },
    {
      fixtureSource: source(),
      followUpAnswer,
      followUpQuery,
      initialAnswer
    }
  )

  await page.route('**/api/search/session/*/messages', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ ok: true })
    })
  })
}

async function installFirstPaintObserver(page: Page) {
  await page.addInitScript(() => {
    const loadingSelectors = [
      '[data-testid="search-route-loading"]',
      '[data-testid="search-progress"]',
      '[data-testid="brok-answer-loading-card"]'
    ] as const
    const resultSelectors = [
      '[data-testid="brok-search-source-0"]',
      '[data-testid="brok-search-answer"]'
    ] as const
    const seen = new Set<string>()
    const events: FirstPaintEvent[] = []

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

    function record(kind: FirstPaintEvent['kind'], selector: string) {
      if (seen.has(selector)) return

      const element = document.querySelector(selector)
      if (!isVisible(element)) return

      seen.add(selector)
      events.push({
        kind,
        selector,
        text: element?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        time: performance.now()
      })
    }

    function check() {
      for (const selector of loadingSelectors) {
        record('loading', selector)
      }
      for (const selector of resultSelectors) {
        record('result', selector)
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
      window as typeof window & { __brokFirstPaintEvents?: FirstPaintEvent[] }
    ).__brokFirstPaintEvents = events
  })
}

async function assertSearchPageLoaded(page: Page) {
  const authRedirected =
    /\/auth|\/login|\/signin|\/sign-in/.test(page.url()) ||
    (await page
      .getByText(/sign in|log in|authentication required/i)
      .first()
      .isVisible()
      .catch(() => false))

  if (authRedirected) {
    fail(
      [
        'Search redirected to auth before the smoke could run.',
        'For local guest-mode smoke, run the dev server with auth disabled or guest search enabled.',
        'Expected local env usually includes ENABLE_AUTH=false plus the project guest-search setting enabled for quick/search modes.',
        `Current URL: ${page.url()}`
      ].join('\n')
    )
  }

  await page.getByTestId('brok-search-client').waitFor({ timeout: 30_000 })
}

async function assertFirstPaintLoadingSignal(page: Page) {
  await page.waitForFunction(
    () => {
      const events =
        (
          window as typeof window & {
            __brokFirstPaintEvents?: FirstPaintEvent[]
          }
        ).__brokFirstPaintEvents ?? []

      return events.some(
        event => event.kind === 'loading' || event.kind === 'result'
      )
    },
    undefined,
    { timeout: 5_000 }
  )

  const events = await page.evaluate<FirstPaintEvent[]>(
    () =>
      (
        window as typeof window & {
          __brokFirstPaintEvents?: FirstPaintEvent[]
        }
      ).__brokFirstPaintEvents ?? []
  )
  const firstLoading = events.find(event => event.kind === 'loading')
  const firstResult = events.find(event => event.kind === 'result')

  if (!firstLoading) {
    fail(
      [
        'expected first-paint loading or progress signal before answer completion',
        firstResult
          ? `first result: ${firstResult.selector} at ${firstResult.time} (${firstResult.text})`
          : 'no loading or result paint event was captured'
      ].join('\n')
    )
  }
  await assert(
    !firstResult || firstLoading.time <= firstResult.time,
    [
      'expected loading/progress signal before source or answer content',
      `first loading: ${firstLoading.selector} at ${firstLoading.time}`,
      `first result: ${firstResult?.selector} at ${firstResult?.time}`
    ].join('\n')
  )
  await assert(
    [
      '[data-testid="search-route-loading"]',
      '[data-testid="search-progress"]',
      '[data-testid="brok-answer-loading-card"]'
    ].includes(firstLoading.selector),
    `unexpected first-paint loading selector: ${firstLoading.selector}`
  )
}

type FirstVisibleSearchResult = 'source' | 'answer' | 'simultaneous'

async function waitForFirstVisibleSearchResult(page: Page) {
  return page.evaluate<FirstVisibleSearchResult>(
    () =>
      new Promise<FirstVisibleSearchResult>((resolve, reject) => {
        const sourceSelector = '[data-testid="brok-search-source-0"]'
        const answerSelector = '[data-testid="brok-search-answer"]'
        const timeout = window.setTimeout(() => {
          observer.disconnect()
          reject(new Error('timed out waiting for source or answer to appear'))
        }, 10_000)

        function isVisible(selector: string) {
          const element = document.querySelector(selector)
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

        function finish(result: FirstVisibleSearchResult) {
          window.clearTimeout(timeout)
          observer.disconnect()
          resolve(result)
        }

        function check() {
          const sourceVisible = isVisible(sourceSelector)
          const answerVisible = isVisible(answerSelector)

          if (sourceVisible && answerVisible) {
            finish('simultaneous')
          } else if (sourceVisible) {
            finish('source')
          } else if (answerVisible) {
            finish('answer')
          }
        }

        const observer = new MutationObserver(check)
        observer.observe(document.body, {
          attributes: true,
          childList: true,
          subtree: true
        })
        check()
      })
  )
}

async function main() {
  await ensureServerAvailable()

  const browser = await chromium.launch()
  const page = await browser.newPage()

  try {
    await installFirstPaintObserver(page)
    await installRoutes(page)

    const searchUrl = `${baseUrl}/search?q=Fixture+query&mode=quick`
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' })
    await assertFirstPaintLoadingSignal(page)
    await assertSearchPageLoaded(page)
    const firstVisibleSearchResult = await waitForFirstVisibleSearchResult(page)

    const searchProgress = page.getByTestId('search-progress')
    await searchProgress.waitFor({ timeout: 10_000 })
    await assert(
      (await searchProgress.textContent())?.includes('Searching web'),
      'expected search progress to include searching step'
    )
    await assert(
      await searchProgress
        .locator('ol > li')
        .filter({ hasText: 'Searching web' })
        .isVisible(),
      'expected searching progress step'
    )

    await assert(
      firstVisibleSearchResult === 'source',
      'expected source card to appear before answer'
    )

    const sourceCard = page.getByTestId('brok-search-source-0')
    await sourceCard.waitFor({ timeout: 10_000 })
    await assert(
      await sourceCard.getByText('Fixture Source').isVisible(),
      'expected source card before answer'
    )

    await page.getByTestId('brok-search-answer').waitFor({ timeout: 10_000 })
    await assert(
      await page
        .getByTestId('brok-search-answer')
        .getByText('Fixture answer cites')
        .isVisible(),
      'expected cited fixture answer'
    )
    await assert(
      await page
        .getByRole('link', { name: /source 1: fixture source/i })
        .first()
        .isVisible(),
      'expected answer citation link'
    )
    await page.getByTestId('follow-up-chips').waitFor({ timeout: 10_000 })
    await assert(
      await page
        .getByTestId('follow-up-chip-0')
        .getByText('Compare fixture options')
        .isVisible(),
      'expected follow-up chips'
    )
    await page.getByTestId('brok-follow-up-form').waitFor({ timeout: 10_000 })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await assertSearchPageLoaded(page)
    await page.getByTestId('brok-search-answer').waitFor({ timeout: 10_000 })
    await assert(
      sessionRequests.length === 1,
      `expected reload restore without rerunning, got ${sessionRequests.length} session requests`
    )
    await assert(
      await page
        .getByTestId('brok-search-answer')
        .getByText('Fixture answer cites')
        .isVisible(),
      'expected restored answer after reload'
    )

    await page.getByLabel('Ask a follow-up').fill(followUpQuery)
    await page.getByTestId('brok-follow-up-form').evaluate(form => {
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      )
    })
    await page
      .getByText('Use the prior fixture context')
      .waitFor({ timeout: 10_000 })

    await assert(
      sessionRequests.length === 2,
      `expected exactly 2 session requests after follow-up, got ${sessionRequests.length}`
    )
    const followUpRequest = sessionRequests[1]
    await assert(
      followUpRequest.query === followUpQuery,
      'follow-up query was not submitted'
    )
    await assert(
      followUpRequest.mode === 'quick',
      'follow-up did not preserve quick mode'
    )
    await assert(
      Array.isArray(followUpRequest.context) &&
        followUpRequest.context.length === 1 &&
        followUpRequest.context[0]?.query === initialQuery &&
        typeof followUpRequest.context[0]?.answer === 'string' &&
        followUpRequest.context[0].answer.includes('Fixture answer cites'),
      'follow-up request did not include previous context'
    )

    console.log(
      `[smoke:search-mvp] passed against ${baseUrl}; intercepted ${sessionRequests.length} /api/search/session requests.`
    )
  } finally {
    await browser.close()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
