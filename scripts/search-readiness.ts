import {
  collectAnswer,
  collectFollowUps,
  isLocalOrigin,
  normalizeOrigin,
  parseSseEvents,
  qualityErrors,
  type ReadinessStatus,
  sessionContractErrors,
  sourceEvents
} from './search-readiness-core'

type CheckResult = {
  name: string
  status: ReadinessStatus
  detail: string
}

const baseUrl = normalizeOrigin(
  process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
)
const timeoutMs = Number(process.env.BROK_SEARCH_READINESS_TIMEOUT_MS || 45_000)
const query =
  process.env.BROK_SEARCH_READINESS_QUERY ||
  'What is Brok Search and what sources support the answer?'
const runSession = process.env.BROK_SEARCH_READINESS_RUN_SESSION === 'true'
const allowLiveProvider =
  process.env.BROK_SEARCH_READINESS_ALLOW_LIVE_PROVIDER === 'true'
const runApiCompletion =
  process.env.BROK_SEARCH_READINESS_RUN_API_COMPLETION === 'true'
const apiKey = process.env.BROK_SEARCH_READINESS_API_KEY || ''
const invalidApiKey =
  process.env.BROK_SEARCH_READINESS_INVALID_API_KEY ||
  'brok_sk_invalid_readiness_probe'

function result(name: string, status: ReadinessStatus, detail: string) {
  return { name, status, detail }
}

function pass(name: string, detail: string) {
  return result(name, 'PASS', detail)
}

function fail(name: string, detail: string) {
  return result(name, 'FAIL', detail)
}

function skip(name: string, detail: string) {
  return result(name, 'SKIP', detail)
}

async function fetchWithTimeout(input: string, init?: RequestInit) {
  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs)
  })
}

async function readResponseBody(response: Response) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try {
      return JSON.stringify(await response.json())
    } catch {
      return await response.text()
    }
  }
  return await response.text()
}

function readErrorCode(bodyText: string) {
  try {
    const body = JSON.parse(bodyText)
    return typeof body?.error?.code === 'string' ? body.error.code : null
  } catch {
    return null
  }
}

async function checkDemoPage() {
  const name = 'GET /search/demo public page'
  const response = await fetchWithTimeout(`${baseUrl}/search/demo`, {
    redirect: 'follow',
    headers: { Accept: 'text/html' }
  })
  const text = await response.text()
  const contentType = response.headers.get('content-type') || ''

  if (!response.ok) {
    return fail(name, `expected 2xx, got ${response.status}`)
  }
  if (!contentType.includes('text/html')) {
    return fail(name, `expected text/html, got ${contentType || 'unknown'}`)
  }
  if (!/brok|search/i.test(text)) {
    return fail(name, 'page loaded but did not contain Brok/search copy')
  }

  return pass(name, `loaded ${response.url} (${text.length} chars)`)
}

async function checkSearchSession() {
  const name = 'POST /api/search/session SSE contract'

  if (!runSession) {
    return skip(
      name,
      'BROK_SEARCH_READINESS_RUN_SESSION=true is required because this may call live search/LLM providers.'
    )
  }
  if (!isLocalOrigin(baseUrl) && !allowLiveProvider) {
    return skip(
      name,
      'non-local target requires BROK_SEARCH_READINESS_ALLOW_LIVE_PROVIDER=true.'
    )
  }

  const startedAt = Date.now()
  const response = await fetchWithTimeout(`${baseUrl}/api/search/session`, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query,
      mode: 'quick',
      depth: 'lite'
    })
  })
  const latencyMs = Date.now() - startedAt
  const contentType = response.headers.get('content-type') || ''

  if (response.status === 401 || response.status === 403) {
    const body = await readResponseBody(response)
    return skip(
      name,
      `guest/local search is not permitted on this target (${response.status}: ${body.slice(0, 180)}).`
    )
  }
  if (!response.ok) {
    return fail(
      name,
      `expected 200 or auth skip, got ${response.status}: ${(await readResponseBody(response)).slice(0, 240)}`
    )
  }
  if (!contentType.includes('text/event-stream')) {
    return fail(name, `expected text/event-stream, got ${contentType}`)
  }

  const raw = await response.text()
  const events = parseSseEvents(raw)
  const contractErrors = sessionContractErrors(events, raw)
  if (contractErrors.length > 0) {
    return fail(name, contractErrors.join('; '))
  }

  const answer = collectAnswer(events)
  const sources = sourceEvents(events)
  const followUps = collectFollowUps(events)
  const quality = qualityErrors({
    answer,
    sourceEvents: sources,
    followUpItems: followUps,
    latencyMs
  })
  if (quality.length > 0) {
    return fail(name, quality.join('; '))
  }

  return pass(
    name,
    `completed in ${latencyMs}ms with ${sources.length} source/citation events and ${followUps.length} follow-ups.`
  )
}

async function checkSearchCompletionsAuth() {
  const name = 'POST /api/v1/search/completions auth contract'
  const response = await fetchWithTimeout(
    `${baseUrl}/api/v1/search/completions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'What is Brok?',
        model: 'brok-search',
        stream: false,
        search_depth: 'lite'
      })
    }
  )
  const body = await readResponseBody(response)
  const code = readErrorCode(body)

  if (response.status !== 401 || code !== 'missing_authorization') {
    return fail(
      name,
      `expected 401 missing_authorization, got ${response.status} ${code ?? body.slice(0, 160)}`
    )
  }

  return pass(name, 'missing bearer/x-api-key is rejected before search.')
}

async function checkSearchCompletionsInvalidKey() {
  const name = 'POST /api/v1/search/completions invalid key'
  const response = await fetchWithTimeout(
    `${baseUrl}/api/v1/search/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${invalidApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: 'What is Brok?',
        model: 'brok-search',
        stream: false,
        search_depth: 'lite'
      })
    }
  )
  const body = await readResponseBody(response)
  const code = readErrorCode(body)

  if (response.status === 503 && code === 'auth_storage_unavailable') {
    return skip(
      name,
      'auth storage is unavailable, so invalid-key lookup could not be proven without DB/env setup.'
    )
  }
  if (response.status !== 401 || code !== 'invalid_api_key') {
    return fail(
      name,
      `expected 401 invalid_api_key, got ${response.status} ${code ?? body.slice(0, 160)}`
    )
  }

  return pass(name, 'invalid bearer key is rejected before search.')
}

async function checkSearchCompletionsRealRun() {
  const name = 'POST /api/v1/search/completions real run'

  if (!runApiCompletion) {
    return skip(
      name,
      'BROK_SEARCH_READINESS_RUN_API_COMPLETION=true is required because this is a billable/provider-backed path.'
    )
  }
  if (!apiKey) {
    return skip(name, 'BROK_SEARCH_READINESS_API_KEY is required.')
  }
  if (!isLocalOrigin(baseUrl) && !allowLiveProvider) {
    return skip(
      name,
      'non-local target requires BROK_SEARCH_READINESS_ALLOW_LIVE_PROVIDER=true.'
    )
  }

  const startedAt = Date.now()
  const response = await fetchWithTimeout(
    `${baseUrl}/api/v1/search/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        model: 'brok-search',
        stream: false,
        search_depth: 'lite'
      })
    }
  )
  const latencyMs = Date.now() - startedAt
  const bodyText = await readResponseBody(response)

  if (!response.ok) {
    return fail(
      name,
      `expected 200, got ${response.status}: ${bodyText.slice(0, 240)}`
    )
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(bodyText)
  } catch {
    return fail(name, 'response was not JSON')
  }

  const citations = Array.isArray(body.citations) ? body.citations : []
  const followUps = Array.isArray(body.follow_ups) ? body.follow_ups : []
  const content =
    Array.isArray(body.choices) &&
    body.choices[0] &&
    typeof body.choices[0] === 'object'
      ? String(
          (
            (body.choices[0] as Record<string, unknown>).message as
              | Record<string, unknown>
              | undefined
          )?.content ?? ''
        )
      : ''

  const quality = qualityErrors({
    answer: content,
    sourceEvents: citations.map((citation, index) => ({
      event: 'citation',
      data: citation,
      raw: `citation ${index + 1}`
    })),
    followUpItems: followUps,
    latencyMs
  })
  if (quality.length > 0) {
    return fail(name, quality.join('; '))
  }

  return pass(
    name,
    `completed in ${latencyMs}ms with ${citations.length} citations and ${followUps.length} follow-ups.`
  )
}

async function runCheck(check: () => Promise<CheckResult>) {
  try {
    return await check()
  } catch (error) {
    return fail(
      'readiness harness error',
      error instanceof Error ? error.message : String(error)
    )
  }
}

async function main() {
  const checks = [
    checkDemoPage,
    checkSearchCompletionsAuth,
    checkSearchCompletionsInvalidKey,
    checkSearchSession,
    checkSearchCompletionsRealRun
  ]
  const results: CheckResult[] = []

  console.log(`[search-readiness] target=${baseUrl}`)
  console.log(
    '[search-readiness] provider-backed checks are skipped unless explicitly enabled.'
  )

  for (const check of checks) {
    const checkResult = await runCheck(check)
    results.push(checkResult)
    console.log(
      `${checkResult.status} ${checkResult.name}: ${checkResult.detail}`
    )
  }

  const failed = results.filter(check => check.status === 'FAIL')
  const passed = results.filter(check => check.status === 'PASS')
  const skipped = results.filter(check => check.status === 'SKIP')
  console.log(
    `[search-readiness] summary: ${passed.length} passed, ${skipped.length} skipped, ${failed.length} failed.`
  )

  if (failed.length > 0) {
    process.exit(1)
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
