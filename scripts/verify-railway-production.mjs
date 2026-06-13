#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const APP_BASE_URL = (
  process.env.BROK_PROD_BASE_URL || 'https://www.brok.fyi'
).replace(/\/+$/, '')
const DOCS_BASE_URL = (
  process.env.BROK_PROD_DOCS_URL || 'https://docs.brok.fyi'
).replace(/\/+$/, '')
const TIMEOUT_MS = Number(process.env.BROK_PROD_CHECK_TIMEOUT_MS || '12000')
const REPORT_DIR = process.env.BROK_PROD_CHECK_REPORT_DIR || '.brok-audits'
const now = new Date().toISOString()

const checks = []
const fullProofCommands = [
  `SMOKE_BASE_URL=${APP_BASE_URL} STRESS_PLATFORM_CONTRACTS_ONLY=true bun run stress:platform`,
  `SMOKE_BASE_URL=${APP_BASE_URL} SMOKE_SEED_TOKEN="$SMOKE_SEED_TOKEN" bun run smoke:platform`,
  `SMOKE_BASE_URL=${APP_BASE_URL} SMOKE_SEED_TOKEN="$SMOKE_SEED_TOKEN" bun run stress:platform`
]

function pushCheck(check) {
  checks.push(check)
  const status = `${check.ok ? 'PASS' : 'FAIL'} ${check.name}`
  const details = check.details.length
    ? ` | ${check.details}`
    : ' (no additional details)'
  console.log(`${status}${details}`)
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
      return pushCheck({
        name,
        url,
        status: response.status,
        ok: false,
        details: `Expected ${options.expectedStatuses.join(', ')}, got ${response.status}`
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
    if (expected && !html.includes(expected)) {
      return pushCheck({
        name,
        url,
        status: response.status,
        ok: false,
        details: `Response missing expected marker: ${expected}`
      })
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
      return pushCheck({
        name,
        url,
        status: response.status,
        ok: false,
        details: `Expected ${expectedStatuses.join(', ')}, got ${response.status}: ${raw.slice(
          0,
          180
        )}`
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
      return pushCheck({
        name,
        url,
        status: response.status,
        ok: false,
        details: `Expected ${allowedStatuses.join(', ')}, got ${
          response.status
        }: ${raw.slice(0, 180)}`
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
      'BrokMail docs route',
      `${APP_BASE_URL}/docs/brokmail`,
      '/api/brokmail/gcal/events'
    ),
    checkHtmlRoute(
      'BrokMail docs proxy route',
      `${DOCS_BASE_URL}/docs/brokmail`,
      '/api/brokmail/gcal/events'
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
          Authorization: 'Bearer test-nope'
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
    )
  ])

  const failed = checks.filter(check => !check.ok)
  const report = {
    checkedAt: now,
    appBase: APP_BASE_URL,
    docsBase: DOCS_BASE_URL,
    timeoutMs: TIMEOUT_MS,
    fullProofCommands,
    summary: {
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length
    },
    checks
  }

  const outputDir = REPORT_DIR
  const stamp = now.replace(/[:.]/g, '-')
  const file = `${outputDir}/${stamp}.json`
  const latest = `${outputDir}/railway-production-check-latest.json`

  await mkdir(outputDir, { recursive: true })
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(latest, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(`\nSaved report: ${path.resolve(file)}`)

  if (failed.length > 0) {
    console.error(`\n${failed.length} production checks failed.`)
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
