#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const cliOptions = parseArgs(process.argv.slice(2))
const APP_BASE_URL = (
  cliOptions.appUrl ||
  process.env.BROK_PROD_BASE_URL ||
  'https://www.brok.fyi'
).replace(/\/+$/, '')
const DOCS_BASE_URL = (
  cliOptions.docsUrl ||
  (cliOptions.appUrl ? cliOptions.appUrl : undefined) ||
  process.env.BROK_PROD_DOCS_URL ||
  'https://docs.brok.fyi'
).replace(/\/+$/, '')
const TIMEOUT_MS = Number(process.env.BROK_PROD_CHECK_TIMEOUT_MS || '12000')
const REPORT_DIR = process.env.BROK_PROD_CHECK_REPORT_DIR || '.brok-audits'
const WRITE_REPORTS = !cliOptions.noWrite
const VALID_SHAPED_INVALID_API_KEY = [
  'brok',
  'sk',
  'test',
  'invalidproductionproof1234567890'
].join('_')
const now = new Date().toISOString()

const checks = []
const serverRouteDiagnostics = [
  {
    pattern: /^\/api\/health$/,
    surface: 'health API',
    expected: 'health JSON or an explicit 404 when the endpoint is not exposed',
    blockerHint: 'runtime health/config endpoint crashed before responding'
  },
  {
    pattern: /^\/api\/v1\/models$/,
    surface: 'Brok API models',
    expected: '200 model catalog or 401 missing_authorization JSON',
    blockerHint: 'API runtime/config crashed before the auth/model contract ran'
  },
  {
    pattern: /^\/api\/v1\//,
    surface: 'Brok API platform',
    expected: 'JSON auth/error contract',
    blockerHint: 'API runtime/config crashed before the platform contract ran'
  },
  {
    pattern: /^\/api\/build\/plan$/,
    surface: 'BrokCode build planner',
    expected: '400 validation JSON for malformed demo requests',
    blockerHint: 'BrokCode planner runtime/config crashed before validation ran'
  },
  {
    pattern: /^\/api\/brokcode\//,
    surface: 'BrokCode route contract',
    expected: '401 authorization contract for unauthenticated requests',
    blockerHint: 'BrokCode server runtime/config crashed before auth ran'
  },
  {
    pattern: /^\/api\/brokmail\//,
    surface: 'BrokMail route contract',
    expected:
      '401 Authentication required contract for unauthenticated requests',
    blockerHint: 'BrokMail server runtime/config crashed before auth ran'
  },
  {
    pattern: /^\/api\/admin\/brok\/smoke-seed$/,
    surface: 'smoke seed gate',
    expected: '401 Unauthorized or 404 Not found without a seed token',
    blockerHint: 'admin runtime/config crashed before the smoke-seed gate ran'
  }
]
const protectedAppRouteDiagnostics = [
  {
    pattern: /^\/brokcode$/,
    surface: 'BrokCode protected page',
    expected: 'redirect to login'
  },
  {
    pattern: /^\/brokmail$/,
    surface: 'BrokMail protected page',
    expected: 'redirect to login'
  },
  {
    pattern: /^\/presentations$/,
    surface: 'presentations protected page',
    expected: 'redirect to login'
  },
  {
    pattern: /^\/integrations$/,
    surface: 'integrations protected page',
    expected: 'redirect to login'
  },
  {
    pattern: /^\/admin\/brok$/,
    surface: 'admin protected page',
    expected: 'redirect to login'
  },
  {
    pattern: /^\/api-platform\/usage$/,
    surface: 'API usage protected page',
    expected: 'redirect to login'
  }
]
const docsRouteDiagnostics = [
  {
    pattern: /^\/docs\/brokcode-api$/,
    surface: 'BrokCode API docs proxy',
    expected: 'static docs HTML with API route markers'
  },
  {
    pattern: /^\/docs\/brokcode$/,
    surface: 'BrokCode docs proxy',
    expected: 'static docs HTML with Terminal TUI marker'
  },
  {
    pattern: /^\/docs\/brokmail$/,
    surface: 'BrokMail docs proxy',
    expected: 'static docs HTML with mail/calendar route markers'
  },
  {
    pattern: /^\/docs$/,
    surface: 'docs index proxy',
    expected: 'static docs HTML'
  }
]
const fullProofCommands = [
  `SMOKE_BASE_URL=${APP_BASE_URL} STRESS_PLATFORM_CONTRACTS_ONLY=true bun run stress:platform`,
  `SMOKE_BASE_URL=${APP_BASE_URL} SMOKE_SEED_TOKEN="$SMOKE_SEED_TOKEN" bun run smoke:platform`,
  `SMOKE_BASE_URL=${APP_BASE_URL} SMOKE_SEED_TOKEN="$SMOKE_SEED_TOKEN" bun run stress:platform`
]

function parseArgs(args) {
  const options = {}

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const next = args[index + 1]

    if (arg === '--url' || arg === '--app-url') {
      options.appUrl = readArgValue(arg, next)
      index += 1
    } else if (arg === '--docs-url') {
      options.docsUrl = readArgValue(arg, next)
      index += 1
    } else if (arg === '--no-write') {
      options.noWrite = true
    } else {
      throw new Error(
        `Unknown argument: ${arg}. Use --url, --app-url, --docs-url, or --no-write.`
      )
    }
  }

  return options
}

function readArgValue(flag, value) {
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`)
  }

  return value
}

function pushCheck(check) {
  checks.push(check)
  const status = `${check.ok ? 'PASS' : 'FAIL'} ${check.name}`
  const details = check.details.length
    ? ` | ${check.details}`
    : ' (no additional details)'
  console.log(`${status}${details}`)
}

function getPathname(url) {
  try {
    return new URL(url).pathname
  } catch {
    return ''
  }
}

function findRouteDiagnostic(url) {
  const pathname = getPathname(url)
  return (
    serverRouteDiagnostics.find(route => route.pattern.test(pathname)) ||
    protectedAppRouteDiagnostics.find(route => route.pattern.test(pathname)) ||
    docsRouteDiagnostics.find(route => route.pattern.test(pathname))
  )
}

function looksLikeNextRuntimeError(raw) {
  if (!raw || typeof raw !== 'string') return false
  return raw.includes('id="__next_error__"') || raw.includes('__next_error__')
}

function buildUnexpectedStatusDiagnostic({ url, status, raw, contentType }) {
  const route = findRouteDiagnostic(url)
  if (!route) return null

  if (status === 500 && looksLikeNextRuntimeError(raw)) {
    const routeHint = route.blockerHint ?? `${route.surface} crashed`
    return {
      classification: 'environment_deployment_blocker',
      confidence: 'high',
      surface: route.surface,
      details: `${route.surface}: expected ${route.expected}; got Next.js runtime 500. ${routeHint}. This is a deployment environment/config blocker until runtime env is present, not proof of an app-regression root cause.`
    }
  }

  if (status === 500) {
    return {
      classification: 'runtime_failure_unclassified',
      confidence: 'medium',
      surface: route.surface,
      details: `${route.surface}: expected ${route.expected}; got HTTP 500${
        contentType ? ` (${contentType})` : ''
      }. Investigate server logs before classifying as env/config.`
    }
  }

  return {
    classification: 'route_contract_failure',
    confidence: 'high',
    surface: route.surface,
    details: `${route.surface}: expected ${route.expected}; got HTTP ${status}.`
  }
}

function formatUnexpectedDetails(baseDetails, diagnostic) {
  if (!diagnostic) return baseDetails
  return `${baseDetails} | ${diagnostic.details}`
}

function buildFailureSummary(failedChecks) {
  const envBlockers = failedChecks.filter(
    check => check.classification === 'environment_deployment_blocker'
  )
  const unclassified = failedChecks.filter(
    check => check.classification !== 'environment_deployment_blocker'
  )

  if (envBlockers.length > 0 && unclassified.length === 0) {
    return {
      classification: 'environment_deployment_blocker',
      confidence: 'high',
      blocker:
        'Static/docs routes responded, but server/API/protected route contracts returned Next.js runtime 500 documents. Restore required runtime env/config and re-run before treating this as an app regression.',
      environmentBlockerFailures: envBlockers.length,
      unclassifiedFailures: 0
    }
  }

  if (envBlockers.length > 0) {
    return {
      classification: 'mixed_failures',
      confidence: 'medium',
      blocker:
        'Some failures look like missing runtime env/config, but other route contract failures remain. Fix env/config first, then re-run to isolate app regressions.',
      environmentBlockerFailures: envBlockers.length,
      unclassifiedFailures: unclassified.length
    }
  }

  if (failedChecks.length > 0) {
    return {
      classification: 'app_or_runtime_regression',
      confidence: 'medium',
      blocker:
        'Failures did not match the conservative missing-env/config pattern. Investigate route behavior and server logs.',
      environmentBlockerFailures: 0,
      unclassifiedFailures: failedChecks.length
    }
  }

  return {
    classification: 'passed',
    confidence: 'high',
    blocker: null,
    environmentBlockerFailures: 0,
    unclassifiedFailures: 0
  }
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    return await fetch(url, {
      redirect: 'manual',
      ...init,
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function checkHtmlRoute(
  name,
  url,
  expected,
  options = {
    expectedStatuses: [200],
    expectedLocationIncludes: undefined
  }
) {
  try {
    const response = await fetchWithTimeout(url, { method: 'GET' })
    const location = response.headers.get('location')

    if (!options.expectedStatuses.includes(response.status)) {
      const raw = response.status >= 500 ? await response.text() : ''
      const diagnostic = buildUnexpectedStatusDiagnostic({
        url,
        status: response.status,
        raw,
        contentType: response.headers.get('content-type') || ''
      })

      return pushCheck({
        name,
        url,
        status: response.status,
        ok: false,
        classification: diagnostic?.classification,
        confidence: diagnostic?.confidence,
        surface: diagnostic?.surface,
        details: formatUnexpectedDetails(
          `Expected ${options.expectedStatuses.join(', ')}, got ${
            response.status
          }`,
          diagnostic
        )
      })
    }

    if (options.expectedLocationIncludes) {
      if (!location || !location.includes(options.expectedLocationIncludes)) {
        return pushCheck({
          name,
          url,
          status: response.status,
          ok: false,
          details: `Redirect missing expected location token: ${options.expectedLocationIncludes}`
        })
      }

      return pushCheck({
        name,
        url,
        status: response.status,
        ok: true,
        details: `location=${location}`
      })
    }

    if (!response.ok) {
      return pushCheck({
        name,
        url,
        status: response.status,
        ok: false,
        details: `Expected 200, got ${response.status}`
      })
    }

    const html = await response.text()
    if (expected) {
      const expectedMarkers = Array.isArray(expected) ? expected : [expected]
      if (!expectedMarkers.some(marker => html.includes(marker))) {
        return pushCheck({
          name,
          url,
          status: response.status,
          ok: false,
          details: `Response missing expected marker: ${expectedMarkers.join(', ')}`
        })
      }
    }

    return pushCheck({
      name,
      url,
      status: response.status,
      ok: true,
      details: `x-host=${response.headers.get('x-host') ?? 'n/a'}`
    })
  } catch (error) {
    return pushCheck({
      name,
      url,
      ok: false,
      details:
        error instanceof Error
          ? `Request failed: ${error.name}: ${error.message}`
          : 'Request failed unexpectedly'
    })
  }
}

async function checkJsonApi(
  name,
  url,
  validator,
  expectedStatuses = [200],
  requestInit = {}
) {
  try {
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        accept: 'application/json'
      },
      ...requestInit
    })

    const raw = await response.text()

    if (!expectedStatuses.includes(response.status)) {
      const diagnostic = buildUnexpectedStatusDiagnostic({
        url,
        status: response.status,
        raw,
        contentType: response.headers.get('content-type') || ''
      })

      return pushCheck({
        name,
        url,
        status: response.status,
        ok: false,
        classification: diagnostic?.classification,
        confidence: diagnostic?.confidence,
        surface: diagnostic?.surface,
        details: formatUnexpectedDetails(
          `Expected ${expectedStatuses.join(', ')}, got ${
            response.status
          }: ${raw.slice(0, 180)}`,
          diagnostic
        )
      })
    }

    let payload
    try {
      payload = JSON.parse(raw)
    } catch {
      return pushCheck({
        name,
        url,
        status: response.status,
        ok: false,
        details: 'Response was not valid JSON'
      })
    }

    const validation = validator(payload, response)
    if (validation) {
      return pushCheck({
        name,
        url,
        status: response.status,
        ok: false,
        details: validation
      })
    }

    return pushCheck({
      name,
      url,
      status: response.status,
      ok: true,
      details: `railway-edge=${response.headers.get('x-railway-edge') ?? 'n/a'}`
    })
  } catch (error) {
    return pushCheck({
      name,
      url,
      ok: false,
      details:
        error instanceof Error
          ? `Request failed: ${error.name}: ${error.message}`
          : 'Request failed unexpectedly'
    })
  }
}

async function checkRouteContract(
  name,
  url,
  {
    expectedStatus,
    expectedStatuses,
    expectedText,
    expectedAnyText,
    expectedErrorText,
    requestInit = {}
  }
) {
  try {
    const response = await fetchWithTimeout(url, requestInit)
    const contentType = response.headers.get('content-type') || ''
    const raw = await response.text()
    let payload = raw

    if (contentType.includes('application/json')) {
      try {
        payload = JSON.parse(raw)
      } catch {
        payload = raw
      }
    }

    const allowedStatuses = expectedStatuses ?? [expectedStatus]
    if (!allowedStatuses.includes(response.status)) {
      const diagnostic = buildUnexpectedStatusDiagnostic({
        url,
        status: response.status,
        raw,
        contentType
      })

      return pushCheck({
        name,
        url,
        status: response.status,
        ok: false,
        classification: diagnostic?.classification,
        confidence: diagnostic?.confidence,
        surface: diagnostic?.surface,
        details: formatUnexpectedDetails(
          `Expected ${allowedStatuses.join(', ')}, got ${
            response.status
          }: ${raw.slice(0, 180)}`,
          diagnostic
        )
      })
    }

    const searchable =
      typeof payload === 'string' ? payload : JSON.stringify(payload)

    if (expectedText && !searchable.includes(expectedText)) {
      return pushCheck({
        name,
        url,
        status: response.status,
        ok: false,
        details: `Response missing expected marker: ${expectedText}`
      })
    }

    if (
      expectedAnyText &&
      !expectedAnyText.some(text => searchable.includes(text))
    ) {
      return pushCheck({
        name,
        url,
        status: response.status,
        ok: false,
        details: `Response missing expected markers: ${expectedAnyText.join(
          ', '
        )}`
      })
    }

    if (expectedErrorText && !searchable.includes(expectedErrorText)) {
      return pushCheck({
        name,
        url,
        status: response.status,
        ok: false,
        details: `Response missing expected error marker: ${expectedErrorText}`
      })
    }

    return pushCheck({
      name,
      url,
      status: response.status,
      ok: true,
      details: `content-type=${contentType || 'n/a'}`
    })
  } catch (error) {
    return pushCheck({
      name,
      url,
      ok: false,
      details:
        error instanceof Error
          ? `Request failed: ${error.name}: ${error.message}`
          : 'Request failed unexpectedly'
    })
  }
}

function hasMissingAuthorization(payload) {
  if (!payload || typeof payload !== 'object') return false
  return payload?.error?.code === 'missing_authorization'
}

function hasInvalidApiKey(payload) {
  if (!payload || typeof payload !== 'object') return false
  return payload?.error?.code === 'invalid_api_key'
}

async function main() {
  const protectedRedirectLocations = {
    BrokCode: '/auth/login?redirectTo=%2Fbrokcode',
    Presentations: '/auth/login?redirectTo=%2Fpresentations',
    Integrations: '/auth/login?redirectTo=%2Fintegrations'
  }

  await Promise.all([
    checkHtmlRoute('Home page', `${APP_BASE_URL}/`, 'Brok'),
    checkHtmlRoute('Docs route', `${DOCS_BASE_URL}/docs`),
    checkHtmlRoute('Features route', `${APP_BASE_URL}/features`, 'Brok tools'),
    checkHtmlRoute('Pricing route', `${APP_BASE_URL}/pricing`, '$7'),
    checkHtmlRoute(
      'BrokCode docs route',
      `${APP_BASE_URL}/docs/brokcode`,
      'Terminal TUI'
    ),
    checkHtmlRoute(
      'BrokCode API docs route',
      `${APP_BASE_URL}/docs/brokcode-api`,
      'POST /api/brokcode/execute'
    ),
    checkHtmlRoute(
      'API quickstart docs route',
      `${APP_BASE_URL}/docs/quickstart`,
      ['Idempotency-Key', '/api/v1/chat/completions']
    ),
    checkRouteContract('OpenAPI JSON route', `${APP_BASE_URL}/api/openapi`, {
      expectedStatus: 200,
      expectedAnyText: [
        '/api/v1/chat/completions',
        '/api/v1/search/completions'
      ]
    }),
    checkHtmlRoute('BrokMail docs route', `${APP_BASE_URL}/docs/brokmail`, [
      '/api/brokmail/gcal/events',
      '/api/brokmail/calendar/events'
    ]),
    checkHtmlRoute(
      'BrokMail docs proxy route',
      `${DOCS_BASE_URL}/docs/brokmail`,
      ['/api/brokmail/gcal/events', '/api/brokmail/calendar/events']
    ),
    checkRouteContract(
      'API health endpoint exposure',
      `${APP_BASE_URL}/api/health`,
      {
        expectedStatuses: [200, 404]
      }
    ),
    checkHtmlRoute(
      'BrokCode route (auth required)',
      `${APP_BASE_URL}/brokcode`,
      undefined,
      {
        expectedStatuses: [302, 307, 308],
        expectedLocationIncludes: protectedRedirectLocations.BrokCode
      }
    ),
    checkHtmlRoute(
      'Presentations route (auth required)',
      `${APP_BASE_URL}/presentations`,
      undefined,
      {
        expectedStatuses: [302, 307, 308],
        expectedLocationIncludes: protectedRedirectLocations.Presentations
      }
    ),
    checkHtmlRoute(
      'Integrations route (auth required)',
      `${APP_BASE_URL}/integrations`,
      undefined,
      {
        expectedStatuses: [302, 307, 308],
        expectedLocationIncludes: protectedRedirectLocations.Integrations
      }
    ),
    checkHtmlRoute(
      'Admin route (auth required)',
      `${APP_BASE_URL}/admin/brok`,
      undefined,
      {
        expectedStatuses: [302, 307, 308],
        expectedLocationIncludes: '/auth/login'
      }
    ),
    checkHtmlRoute(
      'API usage page (auth required)',
      `${APP_BASE_URL}/api-platform/usage`,
      undefined,
      {
        expectedStatuses: [302, 307, 308],
        expectedLocationIncludes: '/auth/login'
      }
    ),
    checkHtmlRoute(
      'BrokMail app route (auth required)',
      `${APP_BASE_URL}/brokmail`,
      undefined,
      {
        expectedStatuses: [302, 307, 308],
        expectedLocationIncludes: '/auth/login'
      }
    ),
    checkJsonApi(
      'Models API',
      `${APP_BASE_URL}/api/v1/models`,
      (payload, response) => {
        if (response.status === 401) {
          return hasMissingAuthorization(payload)
            ? null
            : 'Expected missing_authorization'
        }

        if (!payload || typeof payload !== 'object' || !('data' in payload)) {
          return 'Missing { data } in response'
        }

        const data = payload.data
        if (!Array.isArray(data) || data.length === 0) {
          return 'Expected non-empty data array'
        }

        return null
      },
      [200, 401]
    ),
    checkJsonApi(
      'API usage auth gate',
      `${APP_BASE_URL}/api/v1/usage`,
      payload => {
        if (!hasMissingAuthorization(payload)) {
          return 'Expected missing_authorization error without API key'
        }

        return null
      },
      [401]
    ),
    checkRouteContract(
      'Chat completions API auth contract',
      `${APP_BASE_URL}/api/v1/chat/completions`,
      {
        expectedStatus: 401,
        expectedErrorText: 'missing_authorization',
        requestInit: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            accept: 'application/json'
          },
          body: JSON.stringify({
            model: 'brok-mini',
            messages: [{ role: 'user', content: 'production contract check' }]
          })
        }
      }
    ),
    checkRouteContract(
      'Messages API auth contract',
      `${APP_BASE_URL}/api/v1/messages`,
      {
        expectedStatus: 401,
        expectedAnyText: ['missing_authorization', 'authentication_error'],
        requestInit: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            accept: 'application/json'
          },
          body: JSON.stringify({
            model: 'brok-mini',
            messages: [{ role: 'user', content: 'production contract check' }]
          })
        }
      }
    ),
    checkRouteContract(
      'Search completions API auth contract',
      `${APP_BASE_URL}/api/v1/search/completions`,
      {
        expectedStatus: 401,
        expectedErrorText: 'missing_authorization',
        requestInit: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            accept: 'application/json'
          },
          body: JSON.stringify({
            query: 'production contract check'
          })
        }
      }
    ),
    checkJsonApi(
      'Invalid API key rejection',
      `${APP_BASE_URL}/api/v1/usage`,
      (payload, response) => {
        if (response.status === 401) {
          return hasInvalidApiKey(payload) || hasMissingAuthorization(payload)
            ? null
            : 'Expected missing_authorization or invalid_api_key for invalid API key'
        }

        if (response.status === 403) {
          return typeof payload?.error === 'object'
            ? null
            : 'Expected error JSON body for 403'
        }

        return `Unexpected status ${response.status}`
      },
      [401, 403],
      {
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${VALID_SHAPED_INVALID_API_KEY}`
        }
      }
    ),
    checkRouteContract(
      'Build plan invalid JSON contract',
      `${APP_BASE_URL}/api/build/plan`,
      {
        expectedStatus: 400,
        expectedErrorText: 'Invalid JSON body.',
        requestInit: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{'
        }
      }
    ),
    checkRouteContract(
      'Build plan empty prompt contract',
      `${APP_BASE_URL}/api/build/plan`,
      {
        expectedStatus: 400,
        expectedErrorText: 'A non-empty prompt is required.',
        requestInit: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: '' })
        }
      }
    ),
    checkRouteContract(
      'BrokMail Gmail status auth contract',
      `${APP_BASE_URL}/api/brokmail/gmail/status`,
      {
        expectedStatus: 401,
        expectedErrorText: 'Authentication required'
      }
    ),
    checkRouteContract(
      'BrokMail Gmail threads auth contract',
      `${APP_BASE_URL}/api/brokmail/gmail/threads`,
      {
        expectedStatus: 401,
        expectedErrorText: 'Authentication required'
      }
    ),
    checkRouteContract(
      'BrokMail GCal status auth contract',
      `${APP_BASE_URL}/api/brokmail/gcal/status`,
      {
        expectedStatus: 401,
        expectedErrorText: 'Authentication required'
      }
    ),
    checkRouteContract(
      'BrokMail GCal events auth contract',
      `${APP_BASE_URL}/api/brokmail/gcal/events`,
      {
        expectedStatus: 401,
        expectedErrorText: 'Authentication required'
      }
    ),
    checkRouteContract(
      'BrokMail Pi agent auth contract',
      `${APP_BASE_URL}/api/brokmail/pi-agent`,
      {
        expectedStatus: 401,
        expectedErrorText: 'Authentication required',
        requestInit: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'Summarize inbox.' })
        }
      }
    ),
    checkRouteContract(
      'BrokCode sessions GET auth contract',
      `${APP_BASE_URL}/api/brokcode/sessions`,
      {
        expectedStatus: 401,
        expectedErrorText: 'authorization'
      }
    ),
    checkRouteContract(
      'BrokCode sessions POST auth contract',
      `${APP_BASE_URL}/api/brokcode/sessions`,
      {
        expectedStatus: 401,
        expectedErrorText: 'authorization',
        requestInit: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: 'production-check',
            source: 'tui',
            role: 'user',
            content: 'production readiness route contract'
          })
        }
      }
    ),
    checkRouteContract(
      'Smoke seed endpoint auth/config gate',
      `${APP_BASE_URL}/api/admin/brok/smoke-seed`,
      {
        expectedStatuses: [401, 404],
        expectedAnyText: ['Unauthorized', 'Not found'],
        requestInit: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'smoke' })
        }
      }
    ),
    checkRouteContract(
      'Search stream missing message contract',
      `${APP_BASE_URL}/api/search/stream/msg_missing`,
      {
        expectedStatus: 404,
        expectedErrorText: 'search_request_not_found'
      }
    )
  ])

  const failed = checks.filter(check => !check.ok)
  const failureSummary = buildFailureSummary(failed)
  const report = {
    checkedAt: now,
    appBase: APP_BASE_URL,
    docsBase: DOCS_BASE_URL,
    timeoutMs: TIMEOUT_MS,
    fullProofCommands,
    summary: {
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
      failureClassification: failureSummary.classification,
      failureConfidence: failureSummary.confidence,
      environmentBlockerFailures: failureSummary.environmentBlockerFailures,
      unclassifiedFailures: failureSummary.unclassifiedFailures,
      blocker: failureSummary.blocker
    },
    checks
  }

  if (WRITE_REPORTS) {
    const outputDir = REPORT_DIR
    const stamp = now.replace(/[:.]/g, '-')
    const file = `${outputDir}/${stamp}.json`
    const latest = `${outputDir}/railway-production-check-latest.json`

    await mkdir(outputDir, { recursive: true })
    await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    await writeFile(latest, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

    console.log(`\nSaved report: ${path.resolve(file)}`)
  } else {
    console.log('\nReport writing skipped (--no-write).')
  }

  if (failed.length > 0) {
    console.error(`\n${failed.length} production checks failed.`)
    console.error(
      `Failure classification: ${failureSummary.classification} (${failureSummary.confidence})`
    )
    if (failureSummary.blocker) {
      console.error(`Blocker: ${failureSummary.blocker}`)
    }
    process.exitCode = 1
    return
  }

  console.log('\nAll production checks passed.')
  console.log('\nFor full seeded end-to-end proof, run:')
  for (const command of fullProofCommands) {
    console.log(`- ${command}`)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
