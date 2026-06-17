#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const liveMode = process.argv.includes('--live')

const files = [
  'examples/api-platform/README.md',
  'examples/api-platform/AGENTS.md',
  'examples/api-platform/.env.example',
  'examples/api-platform/agent-manifest.json',
  'examples/api-platform/apps/agent-task-runner.mjs',
  'examples/api-platform/apps/lib/brok-client.mjs',
  'examples/api-platform/apps/kery-integration-task.md',
  'examples/api-platform/apps/research-brief.mjs',
  'examples/api-platform/apps/sample-support-ticket.json',
  'examples/api-platform/apps/support-triage.mjs',
  'examples/api-platform/node/client.mjs',
  'examples/api-platform/python/client.py'
]

const nodeExamples = [
  'examples/api-platform/node/client.mjs',
  'examples/api-platform/apps/agent-task-runner.mjs',
  'examples/api-platform/apps/lib/brok-client.mjs',
  'examples/api-platform/apps/research-brief.mjs',
  'examples/api-platform/apps/support-triage.mjs'
]

const pythonExamples = ['examples/api-platform/python/client.py']

const liveExamples = [
  {
    name: 'research brief sample app runs live',
    command: [
      process.execPath,
      [
        'examples/api-platform/apps/research-brief.mjs',
        'What should a public API launch checklist include?'
      ]
    ],
    app: 'research-brief',
    outputKey: 'brief'
  },
  {
    name: 'support triage sample app runs live',
    command: [
      process.execPath,
      [
        'examples/api-platform/apps/support-triage.mjs',
        'examples/api-platform/apps/sample-support-ticket.json'
      ]
    ],
    app: 'support-triage',
    outputKey: 'triage'
  },
  {
    name: 'agent task runner sample app runs live',
    command: [
      process.execPath,
      [
        'examples/api-platform/apps/agent-task-runner.mjs',
        'Draft a three step smoke test plan for an API integration.'
      ]
    ],
    app: 'agent-task-runner',
    outputKey: 'result'
  },
  {
    name: 'Kery integration agent sample runs live',
    command: [
      process.execPath,
      [
        'examples/api-platform/apps/agent-task-runner.mjs',
        '--file',
        'examples/api-platform/apps/kery-integration-task.md'
      ]
    ],
    app: 'agent-task-runner',
    outputKey: 'result'
  }
]

const requiredMarkers = [
  '/api/v1/models',
  '/api/v1/chat/completions',
  '/api/v1/search/completions',
  'BROK_API_KEY',
  'BROK_BASE_URL'
]

const checks = []

for (const file of files) {
  const text = await readFile(file, 'utf8')
  check(text.length > 0, `${file} is not empty`)
  check(
    !/brok_sk_(?!replace|your_key)[A-Za-z0-9_-]{12,}/.test(text),
    `${file} has no committed API key`
  )
}

const readme = await readFile('examples/api-platform/README.md', 'utf8')
for (const marker of requiredMarkers) {
  check(readme.includes(marker), `README documents ${marker}`)
}
check(
  readme.includes('Sample Apps') && readme.includes('--live'),
  'README documents sample apps and live verification'
)

const manifestText = await readFile(
  'examples/api-platform/agent-manifest.json',
  'utf8'
)
const manifest = JSON.parse(manifestText)
check(
  manifest.apiKeyEnv === 'BROK_API_KEY' &&
    manifest.baseUrlEnv === 'BROK_BASE_URL',
  'agent manifest documents required env vars'
)
check(
  Array.isArray(manifest.commands) && manifest.commands.length >= 3,
  'agent manifest lists runnable app commands'
)

for (const file of nodeExamples) {
  const node = spawnSync('node', ['--check', file], {
    encoding: 'utf8'
  })
  if (node.error?.code === 'ENOENT') {
    skip(`Node example parse skipped because node is unavailable: ${file}`)
  } else {
    check(node.status === 0, `Node example parses: ${file}`, node.stderr)
  }
}

for (const file of pythonExamples) {
  const pythonCompile = spawnSync('python3', ['-m', 'py_compile', file], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
  })
  if (pythonCompile.error?.code === 'ENOENT') {
    skip(
      `Python example compile skipped because python3 is unavailable: ${file}`
    )
  } else {
    check(
      pythonCompile.status === 0,
      `Python example compiles: ${file}`,
      pythonCompile.stderr
    )
  }
}

if (liveMode) {
  await runLiveExamples()
} else {
  skip('Live sample app execution skipped; pass --live to run against Brok API')
}

finish()

async function runLiveExamples() {
  const baseUrl = (
    process.env.BROK_BASE_URL ||
    process.env.SMOKE_BASE_URL ||
    'https://www.brok.fyi'
  ).replace(/\/+$/, '')
  const apiKey = process.env.SMOKE_SEED_TOKEN
    ? await seedLiveApiKey(baseUrl)
    : process.env.BROK_API_KEY

  if (!apiKey) {
    throw new Error(
      'Live mode requires BROK_API_KEY or SMOKE_SEED_TOKEN for temporary key seeding.'
    )
  }

  for (const example of liveExamples) {
    const result = runLiveExample(example, baseUrl, apiKey)
    const stdout = result.stdout.trim()
    let parsed = null
    try {
      parsed = stdout ? JSON.parse(stdout) : null
    } catch {
      // keep parsed null so the assertion below reports useful stderr/stdout
    }

    check(
      result.status === 0 &&
        parsed?.app === example.app &&
        typeof parsed?.modelCount === 'number' &&
        parsed.modelCount > 0 &&
        typeof parsed?.[example.outputKey] === 'string' &&
        parsed[example.outputKey].trim().length > 20,
      example.name,
      result.stderr || stdout.slice(0, 500)
    )
  }
}

function runLiveExample(example, baseUrl, apiKey) {
  const [command, args] = example.command
  let lastResult = null

  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = spawnSync(resolveNodeCommand(command), args, {
      encoding: 'utf8',
      env: {
        ...process.env,
        BROK_BASE_URL: baseUrl,
        BROK_API_KEY: apiKey
      },
      timeout: 120_000
    })
    lastResult = result

    if (result.status === 0) {
      return result
    }

    const output = `${result.stderr}\n${result.stdout}`
    if (
      attempt < 3 &&
      /\b(502|503|504|ECONNRESET|ETIMEDOUT|fetch failed)\b/i.test(output)
    ) {
      continue
    }

    return result
  }

  return lastResult
}

function resolveNodeCommand(command) {
  return command === process.execPath ? 'node' : command
}

async function seedLiveApiKey(baseUrl) {
  const token = process.env.SMOKE_SEED_TOKEN
  if (!token) return null

  const response = await fetch(`${baseUrl}/api/admin/brok/smoke-seed`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      kind: 'smoke',
      userId: `api-examples-${Date.now()}`
    })
  })
  const body = await response.json().catch(() => null)

  if (!response.ok || typeof body?.apiKey !== 'string') {
    throw new Error(
      `Failed to seed live API example key (${response.status}): ${JSON.stringify(body)}`
    )
  }

  return body.apiKey
}

function check(ok, name, details = '') {
  checks.push({ ok, name, details, skipped: false })
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${name}${details ? ` | ${details.trim()}` : ''}`
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
    console.log(
      `\nAPI platform example check failed: ${failed.length} issue(s).`
    )
    process.exit(1)
  }
  console.log(
    `\nAPI platform example check passed: ${checks.length - skipped.length} checks${
      skipped.length ? `, ${skipped.length} skipped` : ''
    }.`
  )
}
