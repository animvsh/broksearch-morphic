#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'

const args = new Set(process.argv.slice(2))
const requireExternal = args.has('--require-external')
const DEFAULT_SMOKE_BASE_URL = 'https://www.brok.fyi'

if (args.has('--help') || args.has('-h')) {
  console.log(`API platform launch blocker checker

Usage:
  bun run check:api-platform-launch
  bun run check:api-platform-launch -- --require-external

The default mode validates repo-side launch blocker artifacts. The
--require-external mode also requires external proof inputs such as
SMOKE_SEED_TOKEN without printing their values.`)
  process.exit(0)
}

const checks = [
  fileExists('docs/api-platform-launch-blockers.md'),
  fileExists('.github/workflows/api-platform-production-proof.yml'),
  fileExists('scripts/scan-secrets.ts'),
  fileExists('scripts/secret-scan-core.ts'),
  fileExists('scripts/reconcile-usage-reservations.ts'),
  fileExists('drizzle/0044_usage_events_request_id_idx.sql'),
  fileExists('drizzle/0045_playground_session_keys.sql'),
  packageScriptExists('scan:secrets'),
  packageScriptExists('scan:secrets:local'),
  packageScriptExists('check:deploy-env'),
  packageScriptExists('reconcile:usage-reservations'),
  packageScriptExists('smoke:platform'),
  packageScriptExists('stress:platform'),
  fileContains(
    '.github/workflows/api-platform-production-proof.yml',
    'SMOKE_SEED_TOKEN'
  ),
  fileContains(
    '.github/workflows/api-platform-production-proof.yml',
    'Require seeded smoke token'
  ),
  fileContains('docs/api-platform-launch-blockers.md', 'BRO-163'),
  fileContains('docs/api-platform-launch-blockers.md', 'BRO-165'),
  fileContains('docs/api-platform-launch-blockers.md', 'BRO-168'),
  fileContains('docs/api-platform-launch-blockers.md', 'BRO-182')
]

if (requireExternal) {
  checks.push(envNamePresent('SMOKE_SEED_TOKEN'))
  checks.push(envNamePresentOrDefault('SMOKE_BASE_URL', DEFAULT_SMOKE_BASE_URL))
}

const failed = checks.filter(check => !check.ok)
for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}`)
}

if (!requireExternal) {
  console.log(
    '\nRepo-side launch blocker artifacts are checked. Run with --require-external after production secrets and seeded proof inputs are configured.'
  )
}

if (failed.length > 0) {
  console.log(
    '\nLaunch blocker check failed. Fix the missing artifact/input above; secret values were not printed.'
  )
  process.exit(1)
}

function fileExists(path) {
  return {
    name: `file exists: ${path}`,
    ok: existsSync(path)
  }
}

function fileContains(path, expected) {
  let ok = false
  try {
    ok = readFileSync(path, 'utf8').includes(expected)
  } catch {
    ok = false
  }

  return {
    name: `file contains "${expected}": ${path}`,
    ok
  }
}

function packageScriptExists(scriptName) {
  let ok = false
  try {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
    ok = typeof packageJson.scripts?.[scriptName] === 'string'
  } catch {
    ok = false
  }

  return {
    name: `package script exists: ${scriptName}`,
    ok
  }
}

function envNamePresent(name) {
  return {
    name: `external env configured: ${name}`,
    ok: Boolean(process.env[name])
  }
}

function envNamePresentOrDefault(name, defaultValue) {
  return {
    name: `external env configured: ${name} (default ${defaultValue})`,
    ok: Boolean(process.env[name] || defaultValue)
  }
}
