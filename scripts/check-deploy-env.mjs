#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const DEFAULT_REQUIRED = [
  'DATABASE_URL',
  'DATABASE_RESTRICTED_URL',
  'API_KEY_SALT',
  'OPENAI_COMPATIBLE_API_KEY',
  'OPENAI_COMPATIBLE_API_BASE_URL',
  'TAVILY_API_KEY',
  'ENABLE_AUTH',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'BROK_CLOUD_DEPLOYMENT',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_BASE_URL',
  'BASE_URL'
]

const DEFAULT_OPTIONAL = [
  'NODE_ENV',
  'PORT',
  'NEXT_PUBLIC_BROK_API_BASE_URL',
  'ANONYMOUS_USER_ID',
  'SMOKE_SEED_TOKEN',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'COMPOSIO_API_KEY',
  'COMPOSIO_GMAIL_TOOLKIT_SLUGS',
  'COMPOSIO_GCAL_TOOLKIT_SLUGS',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN'
]

const argv = process.argv.slice(2)
const options = parseArgs(argv)

if (options.help) {
  printHelp()
  process.exit(0)
}

const requiredNames = uniqueList(options.required ?? DEFAULT_REQUIRED)
const optionalNames = uniqueList(options.optional ?? DEFAULT_OPTIONAL)
const providerNames = expandProviders(options.provider)

const results = []
for (const provider of providerNames) {
  results.push(await checkProvider(provider, requiredNames, optionalNames))
}

const failed = results.some(result => !result.ok)
process.exitCode = failed ? 1 : 0

function parseArgs(args) {
  const parsed = {
    provider: 'all',
    environment: 'production',
    envFile: '.env.local'
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const next = args[index + 1]

    if (arg === '--help' || arg === '-h') parsed.help = true
    else if (arg === '--provider')
      parsed.provider = readValue(arg, next, args, index++)
    else if (arg === '--environment')
      parsed.environment = readValue(arg, next, args, index++)
    else if (arg === '--service')
      parsed.service = readValue(arg, next, args, index++)
    else if (arg === '--env-file')
      parsed.envFile = readValue(arg, next, args, index++)
    else if (arg === '--required')
      parsed.required = parseNameList(readValue(arg, next, args, index++))
    else if (arg === '--optional')
      parsed.optional = parseNameList(readValue(arg, next, args, index++))
    else if (arg === '--local') parsed.provider = 'local'
    else if (arg === '--vercel') parsed.provider = 'vercel'
    else if (arg === '--railway') parsed.provider = 'railway'
    else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return parsed
}

function readValue(flag, value, args, originalIndex) {
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`)
  }
  args[originalIndex + 1] = ''
  return value
}

function parseNameList(value) {
  return value
    .split(',')
    .map(name => name.trim())
    .filter(Boolean)
}

function uniqueList(names) {
  return [...new Set(names)]
}

function expandProviders(provider) {
  const providers = provider
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  if (providers.includes('all')) return ['vercel', 'railway', 'local']

  const supported = new Set(['vercel', 'railway', 'local'])
  for (const name of providers) {
    if (!supported.has(name)) {
      throw new Error(
        `Unsupported provider "${name}". Use vercel, railway, local, or all.`
      )
    }
  }

  return providers
}

async function checkProvider(provider, requiredNames, optionalNames) {
  console.log(`\n${provider.toUpperCase()} deploy env readiness`)

  try {
    const variables = await loadProviderVariables(provider)
    return reportProvider(provider, variables, requiredNames, optionalNames)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown provider check failure'
    console.log(`FAIL ${provider}: ${message}`)
    console.log(actionForProvider(provider))
    return { provider, ok: false }
  }
}

async function loadProviderVariables(provider) {
  if (provider === 'local') return readLocalEnvNames(options.envFile)
  if (provider === 'railway') return readRailwayEnvNames()
  if (provider === 'vercel') return readVercelEnvNames()
  throw new Error(`Unsupported provider: ${provider}`)
}

async function readLocalEnvNames(filePath) {
  const raw = await readFile(filePath, 'utf8')
  const names = new Set()

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const match = trimmed.match(
      /^export\s+([A-Za-z_][A-Za-z0-9_]*)\s*=|^([A-Za-z_][A-Za-z0-9_]*)\s*=/
    )
    const name = match?.[1] ?? match?.[2]
    if (name) names.add(name)
  }

  return names
}

async function readRailwayEnvNames() {
  const args = ['variable', 'list', '--json']
  if (options.environment) args.push('--environment', options.environment)
  if (options.service) args.push('--service', options.service)

  const { stdout } = await runCli('railway', args)
  const payload = JSON.parse(stdout)
  return extractNames(payload, ['name', 'key', 'variable'])
}

async function readVercelEnvNames() {
  const envArgs = options.environment ? [options.environment] : []

  try {
    const { stdout } = await runCli('vercel', [
      'env',
      'ls',
      ...envArgs,
      '--format',
      'json'
    ])
    return extractNames(JSON.parse(stdout), ['key', 'name'])
  } catch {
    const { stdout } = await runCli('vercel', ['env', 'ls', ...envArgs])
    return parseVercelTableNames(stdout)
  }
}

function extractNames(payload, keys) {
  const names = new Set()
  const visit = value => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }

    for (const key of Object.keys(value)) {
      if (isEnvName(key)) names.add(key)
    }

    for (const key of keys) {
      if (typeof value[key] === 'string' && isEnvName(value[key])) {
        names.add(value[key])
      }
    }

    for (const nested of Object.values(value)) {
      if (nested && typeof nested === 'object') visit(nested)
    }
  }

  visit(payload)
  return names
}

function parseVercelTableNames(stdout) {
  const names = new Set()

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (
      !trimmed ||
      trimmed.includes('No Environment Variables') ||
      trimmed.startsWith('>') ||
      trimmed.startsWith('Vercel CLI') ||
      /^name\s+/i.test(trimmed)
    ) {
      continue
    }

    const [candidate] = trimmed.split(/\s+/)
    if (isEnvName(candidate)) names.add(candidate)
  }

  return names
}

function isEnvName(value) {
  return /^[A-Z][A-Z0-9_]*$/.test(value)
}

function runCli(command, args) {
  const candidates = [
    command,
    `/opt/homebrew/bin/${command}`,
    process.env.HOME ? `${process.env.HOME}/.bun/bin/${command}` : undefined
  ].filter(Boolean)

  return runCliCandidate(candidates, command, args)
}

function runCliCandidate(candidates, command, args) {
  const [candidate, ...rest] = candidates

  return new Promise((resolve, reject) => {
    let errored = false
    const child = spawn(candidate, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.resume()
    child.on('error', error => {
      errored = true
      if (error.code === 'ENOENT' && rest.length) {
        runCliCandidate(rest, command, args).then(resolve, reject)
        return
      }

      reject(new Error(`${command} CLI is unavailable: ${error.message}`))
    })
    child.on('close', code => {
      if (errored) return

      if (code === 0) {
        resolve({ stdout })
        return
      }

      reject(
        new Error(
          `${command} CLI exited with ${code}. Confirm you are logged in and linked to the right project.`
        )
      )
    })
  })
}

function reportProvider(provider, names, requiredNames, optionalNames) {
  const requiredMissing = requiredNames.filter(name => !names.has(name))
  const optionalMissing = optionalNames.filter(name => !names.has(name))
  const requiredPresent = requiredNames.filter(name => names.has(name))
  const optionalPresent = optionalNames.filter(name => names.has(name))
  const ok = requiredMissing.length === 0

  console.log(`checked names: ${names.size}`)
  console.log(`required present: ${formatNames(requiredPresent)}`)
  console.log(`required missing: ${formatNames(requiredMissing)}`)
  console.log(`optional present: ${formatNames(optionalPresent)}`)
  console.log(`optional missing: ${formatNames(optionalMissing)}`)

  if (ok) {
    console.log(
      `PASS ${provider}: required deploy environment names are present.`
    )
  } else {
    console.log(
      `FAIL ${provider}: ${requiredMissing.length} required deploy environment names are missing.`
    )
    console.log(actionForProvider(provider))
  }

  return { provider, ok, requiredMissing, optionalMissing }
}

function formatNames(names) {
  return names.length ? names.join(', ') : 'none'
}

function actionForProvider(provider) {
  if (provider === 'vercel') {
    return 'Action: add the missing names in Vercel Project Settings -> Environment Variables, then redeploy the affected environment.'
  }

  if (provider === 'railway') {
    return 'Action: add the missing names in Railway Project -> Service -> Variables, then redeploy the service.'
  }

  return `Action: add the missing names to ${options.envFile} or pass --env-file with the file to check.`
}

function printHelp() {
  console.log(`Deploy environment readiness checker

Checks variable-name presence only. It never prints raw environment values.

Usage:
  bun run check:deploy-env
  bun run check:deploy-env -- --provider vercel --environment production
  bun run check:deploy-env -- --provider railway --environment production --service brok
  bun run check:deploy-env -- --provider local --env-file .env.local

Options:
  --provider       vercel, railway, local, or comma-separated list (default: all)
  --environment    target environment name (default: production)
  --service        Railway service name/id when needed
  --env-file       local env file for --provider local (default: .env.local)
  --required       comma-separated required names override
  --optional       comma-separated optional names override
`)
}
