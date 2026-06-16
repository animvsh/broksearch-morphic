#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const options = parseArgs(process.argv.slice(2))
const BASE_URL = (options.url || 'https://www.brok.fyi').replace(/\/+$/, '')
const TIMEOUT_MS = Number(process.env.BROK_DX_CHECK_TIMEOUT_MS || '15000')
const VALID_SHAPED_INVALID_API_KEY = [
  'brok',
  'sk',
  'test',
  'invaliddxprobe1234567890'
].join('_')
const checks = []

await checkSourceDocs()
await checkPublicDocs()
await checkOpenApi()
await checkAuthContracts()
await checkMockProjects()
finish()

function parseArgs(args) {
  const parsed = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const next = args[index + 1]
    if (arg === '--url') {
      if (!next || next.startsWith('--'))
        throw new Error('--url requires a URL')
      parsed.url = next
      index += 1
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return parsed
}

async function checkSourceDocs() {
  const files = [
    'app/docs/api-keys/page.tsx',
    'app/docs/api-reference/page.tsx',
    'app/docs/security/page.tsx',
    'app/docs/errors/page.tsx',
    'app/docs/search-completions/page.tsx',
    'app/docs/chat-completions/page.tsx',
    'app/docs/rate-limits/page.tsx',
    'app/docs/models/page.tsx',
    'app/docs/brokcode/page.tsx',
    'components/playground/code-snippet.tsx',
    'scripts/brokcode-tui.mjs',
    'docs/BROKCODE_CLOUD_PLAN.md'
  ]

  for (const file of files) {
    const text = await readFile(file, 'utf8')
    check(
      !text.includes('https://api.brok.ai'),
      `copy-paste docs use live API base URL: ${file}`
    )
    check(
      !text.includes('do not yet have general persistent expiration'),
      `docs do not claim expiration is missing: ${file}`
    )
    check(!text.includes('+  -H'), `curl examples omit diff markers: ${file}`)
  }
}

async function checkPublicDocs() {
  const pages = [
    ['/docs/quickstart', ['Brok API Quickstart', 'BROK_API_KEY']],
    ['/docs/api-reference', ['API Reference', '/api/v1/chat/completions']],
    ['/docs/api-keys', ['API Keys', 'Zero-Downtime Rotation']],
    [
      '/docs/security',
      ['Security Best Practices', 'Expiration And Revocation']
    ],
    ['/docs/errors', ['Error Codes Reference', 'expired_key']]
  ]

  for (const [route, markers] of pages) {
    const response = await request(`${BASE_URL}${route}`)
    const body = await response.text()
    check(response.status === 200, `docs page loads: ${route}`, response.status)
    for (const marker of markers) {
      check(body.includes(marker), `docs page includes "${marker}": ${route}`)
    }
    check(
      !body.includes('https://api.brok.ai'),
      `live docs avoid dead API domain: ${route}`
    )
    check(!body.includes('+  -H'), `live docs curl is copy-pasteable: ${route}`)
  }
}

async function checkOpenApi() {
  const response = await request(`${BASE_URL}/api/openapi`)
  const spec = await response.json()
  check(response.status === 200, 'OpenAPI route returns 200', response.status)
  check(spec.openapi === '3.1.0', 'OpenAPI contract is 3.1.0')
  for (const route of [
    '/api/v1/models',
    '/api/v1/usage',
    '/api/v1/chat/completions',
    '/api/v1/messages',
    '/api/v1/search/completions'
  ]) {
    check(Boolean(spec.paths?.[route]), `OpenAPI includes ${route}`)
  }
}

async function checkAuthContracts() {
  const missingAuth = await jsonRequest(`${BASE_URL}/api/v1/models`)
  check(missingAuth.status === 401, 'models rejects missing auth with 401')
  check(
    missingAuth.body?.error?.code === 'missing_authorization' ||
      missingAuth.body?.error?.type === 'authentication_error',
    'models missing-auth response is machine-readable'
  )

  const invalidKey = await jsonRequest(`${BASE_URL}/api/v1/models`, {
    headers: { Authorization: `Bearer ${VALID_SHAPED_INVALID_API_KEY}` }
  })
  check(invalidKey.status === 401, 'models rejects invalid key with 401')
  check(
    JSON.stringify(invalidKey.body).includes('invalid') ||
      JSON.stringify(invalidKey.body).includes('authentication'),
    'invalid-key response explains auth failure'
  )

  const buildPlan = await jsonRequest(`${BASE_URL}/api/build/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  })
  check(buildPlan.status === 400, 'build planner rejects empty prompt with 400')
  check(
    !JSON.stringify(buildPlan.body).includes('brok_sk_'),
    'validation errors do not leak API-key shaped strings'
  )
}

async function checkMockProjects() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'brok-api-mock-'))
  const nodeProject = path.join(root, 'node-client.mjs')
  const pythonProject = path.join(root, 'python_client.py')

  await writeFile(nodeProject, nodeClientSource(), 'utf8')
  const nodeResult = spawnSync(process.execPath, [nodeProject], {
    env: { ...process.env, BROK_BASE_URL: BASE_URL },
    encoding: 'utf8',
    timeout: TIMEOUT_MS
  })
  check(
    nodeResult.status === 0,
    'mock Node client runs against Brok API',
    nodeResult.stderr
  )
  check(
    nodeResult.stdout.includes('node mock ok'),
    'mock Node client reaches expected assertion path'
  )

  await writeFile(pythonProject, pythonClientSource(), 'utf8')
  const python = spawnSync('python3', [pythonProject], {
    env: { ...process.env, BROK_BASE_URL: BASE_URL },
    encoding: 'utf8',
    timeout: TIMEOUT_MS
  })
  if (python.error?.code === 'ENOENT') {
    skip('mock Python client skipped because python3 is unavailable')
  } else {
    check(
      python.status === 0,
      'mock Python client runs against Brok API',
      python.stderr
    )
    check(
      python.stdout.includes('python mock ok'),
      'mock Python client reaches expected assertion path'
    )
  }
}

function nodeClientSource() {
  return `
const baseUrl = (process.env.BROK_BASE_URL || 'https://www.brok.fyi').replace(/\\/+$/, '')
const apiKey = process.env.BROK_API_KEY || ['brok', 'sk', 'test', 'invaliddxprobe1234567890'].join('_')

const specResponse = await fetch(baseUrl + '/api/openapi')
if (!specResponse.ok) throw new Error('OpenAPI fetch failed: ' + specResponse.status)
const spec = await specResponse.json()
if (!spec.paths['/api/v1/chat/completions']) throw new Error('missing chat path')

const modelsResponse = await fetch(baseUrl + '/api/v1/models', {
  headers: { Authorization: 'Bearer ' + apiKey }
})
const modelsText = await modelsResponse.text()
if (!process.env.BROK_API_KEY && modelsResponse.status !== 401) {
  throw new Error('invalid mock key should return 401, got ' + modelsResponse.status)
}
if (modelsText.includes(apiKey)) throw new Error('response leaked API key')

console.log('node mock ok')
`
}

function pythonClientSource() {
  return `
import json
import os
import urllib.error
import urllib.request

base_url = os.environ.get("BROK_BASE_URL", "https://www.brok.fyi").rstrip("/")
api_key = os.environ.get("BROK_API_KEY", "_".join(["brok", "sk", "test", "invaliddxprobe1234567890"]))

with urllib.request.urlopen(base_url + "/api/openapi", timeout=15) as response:
    spec = json.loads(response.read().decode("utf-8"))
if "/api/v1/search/completions" not in spec["paths"]:
    raise RuntimeError("missing search path")

request = urllib.request.Request(
    base_url + "/api/v1/models",
    headers={"Authorization": "Bearer " + api_key},
)
try:
    urllib.request.urlopen(request, timeout=15)
    if "BROK_API_KEY" not in os.environ:
        raise RuntimeError("invalid mock key should not authenticate")
except urllib.error.HTTPError as error:
    body = error.read().decode("utf-8")
    if "BROK_API_KEY" not in os.environ and error.code != 401:
        raise RuntimeError("expected 401, got " + str(error.code))
    if api_key in body:
        raise RuntimeError("response leaked API key")

print("python mock ok")
`
}

async function request(url, init = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function jsonRequest(url, init = {}) {
  const response = await request(url, init)
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = { raw: text }
  }
  return { response, status: response.status, body }
}

function check(ok, name, details = '') {
  checks.push({ ok, name, details, skipped: false })
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${name}${details ? ` | ${details}` : ''}`
  )
}

function skip(name) {
  checks.push({ ok: true, name, details: '', skipped: true })
  console.log(`SKIP ${name}`)
}

function finish() {
  const failed = checks.filter(item => !item.ok)
  const skipped = checks.filter(item => item.skipped)
  if (failed.length > 0) {
    console.log(`\nAPI platform DX check failed: ${failed.length} issue(s).`)
    process.exit(1)
  }
  console.log(
    `\nAPI platform DX check passed: ${checks.length - skipped.length} checks${
      skipped.length ? `, ${skipped.length} skipped` : ''
    }.`
  )
}
