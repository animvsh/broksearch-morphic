#!/usr/bin/env node

import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'

const liveMode = process.argv.includes('--live')
const repoApiUrl =
  process.env.KERY_GITHUB_API_URL || 'https://api.github.com/repos/Kery-HQ/Kery'

const checks = []

await verifyLocalKeryFixture()

if (liveMode) {
  await verifyLiveKeryRepo()
} else {
  skip('Live Kery repository proof skipped; pass --live to verify GitHub facts')
}

finish()

async function verifyLocalKeryFixture() {
  const task = await readFile(
    'examples/api-platform/apps/kery-integration-task.md',
    'utf8'
  )
  const readme = await readFile('examples/api-platform/README.md', 'utf8')
  const manifest = JSON.parse(
    await readFile('examples/api-platform/agent-manifest.json', 'utf8')
  )
  const examplesCheck = await readFile(
    'scripts/check-api-platform-examples.mjs',
    'utf8'
  )

  const requiredTaskMarkers = [
    'https://github.com/Kery-HQ/Kery',
    '`kery-oss`',
    '`packages/engine`',
    '`packages/kery`',
    '`packages/mcp`',
    '`keryai`',
    '`@keryai/mcp`',
    '`npx keryai`',
    '`KERY_BASE_URL=http://localhost:11111`'
  ]

  for (const marker of requiredTaskMarkers) {
    check(
      task.includes(marker),
      `Kery task fixture contains ${marker.replaceAll('`', '')}`
    )
  }

  check(
    readme.includes('check:api-platform-kery') &&
      readme.includes('kery-integration-task.md'),
    'README documents Kery proof and agent task'
  )

  check(
    manifest.commands?.some(command => command.id === 'kery-integration-plan'),
    'agent manifest exposes kery-integration-plan command'
  )

  check(
    examplesCheck.includes('Kery integration agent sample runs live'),
    'API examples live checker includes Kery integration sample'
  )
}

async function verifyLiveKeryRepo() {
  const repo = await fetchJson(repoApiUrl)
  check(repo.full_name === 'Kery-HQ/Kery', 'live repo is Kery-HQ/Kery')
  check(repo.default_branch === 'main', 'Kery default branch is main')
  check(
    typeof repo.description === 'string' &&
      /autonomous qa|testing/i.test(repo.description),
    'Kery repo description matches QA/testing positioning'
  )

  const topics = Array.isArray(repo.topics) ? repo.topics : []
  for (const topic of ['mcp', 'playwright', 'qa-agent', 'browser-automation']) {
    check(topics.includes(topic), `Kery repo has ${topic} topic`)
  }

  const packageJson = await fetchContentJson(
    'package.json',
    repo.default_branch
  )
  check(packageJson.name === 'kery-oss', 'Kery root package is kery-oss')
  check(
    Array.isArray(packageJson.workspaces) &&
      packageJson.workspaces.includes('apps/*') &&
      packageJson.workspaces.includes('packages/*'),
    'Kery package workspaces include apps/* and packages/*'
  )
  check(
    typeof packageJson.scripts?.['dev:api'] === 'string',
    'Kery package exposes dev:api script'
  )

  const readme = await fetchContentText('README.md', repo.default_branch)
  for (const marker of [
    'npx keryai',
    'http://localhost:11111',
    '@keryai/mcp',
    'kery_scan'
  ]) {
    check(readme.includes(marker), `Kery README contains ${marker}`)
  }
}

async function fetchContentJson(path, ref) {
  return JSON.parse(await fetchContentText(path, ref))
}

async function fetchContentText(path, ref) {
  const url = `${repoApiUrl}/contents/${path}?ref=${encodeURIComponent(ref)}`
  const payload = await fetchJson(url)
  if (typeof payload.content !== 'string') {
    throw new Error(`GitHub content response for ${path} did not include text`)
  }
  return Buffer.from(payload.content, 'base64').toString('utf8')
}

async function fetchJson(url) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'brok-api-platform-kery-proof'
  }
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  const response = await fetch(url, { headers })
  const body = await response.text()

  if (!response.ok) {
    throw new Error(
      `GitHub request failed for ${redactUrl(url)} (${response.status}): ${body.slice(
        0,
        300
      )}`
    )
  }

  return JSON.parse(body)
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
    console.log(`\nKery API platform proof failed: ${failed.length} issue(s).`)
    process.exit(1)
  }

  console.log(
    `\nKery API platform proof passed: ${checks.length - skipped.length} checks${
      skipped.length ? `, ${skipped.length} skipped` : ''
    }.`
  )
}

function redactUrl(url) {
  return url.replace(/([?&](?:token|access_token)=)[^&]+/gi, '$1[redacted]')
}
