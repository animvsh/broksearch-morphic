#!/usr/bin/env node

import { writeFile } from 'node:fs/promises'
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
    checkJsonApi('Models API', `${APP_BASE_URL}/api/v1/models`, payload => {
      if (!payload || typeof payload !== 'object' || !('data' in payload)) {
        return 'Missing { data } in response'
      }

      const data = payload.data
      if (!Array.isArray(data) || data.length === 0) {
        return 'Expected non-empty data array'
      }

      return null
    }),
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
    )
  ])

  const failed = checks.filter(check => !check.ok)
  const report = {
    checkedAt: now,
    appBase: APP_BASE_URL,
    docsBase: DOCS_BASE_URL,
    timeoutMs: TIMEOUT_MS,
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

  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(latest, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(`\nSaved report: ${path.resolve(file)}`)

  if (failed.length > 0) {
    console.error(`\n${failed.length} production checks failed.`)
    process.exitCode = 1
    return
  }

  console.log('\nAll production checks passed.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
