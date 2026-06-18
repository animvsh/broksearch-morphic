#!/usr/bin/env node

const REQUIRED_LOCAL_GATES = [
  'bun format:check',
  'bun lint',
  'bun typecheck',
  'bun run build',
  'bun run test',
  'bun run smoke:build:browser',
  'bun run smoke:brokcode:browser'
]

const PROOF_GROUPS = [
  {
    id: 'database',
    title: 'DB-backed project persistence',
    requiredAny: [['DATABASE_URL']],
    proof:
      'Run project creation, file edit, and reload/session-boundary checks against a real PostgreSQL database.'
  },
  {
    id: 'brokcode-runtime',
    title: 'No-fallback BrokCode provider runtime',
    requiredAny: [
      ['BROKCODE_OPENCODE_BASE_URL', 'BROKCODE_OPENCODE_API_KEY'],
      ['BROKCODE_PROVIDER_API_KEY'],
      ['PI_API_KEY']
    ],
    optional: [
      'OPENAI_API_KEY',
      'BROKCODE_REQUIRE_OPENCODE',
      'BROKCODE_REQUIRE_PI',
      'BROKCODE_DEFAULT_MODEL',
      'BROKCODE_OPENCODE_MODEL',
      'SMOKE_BROKCODE_NO_FALLBACK'
    ],
    proof:
      'Run a prompt-to-app smoke with fallback disabled and verify generated files, preview, edit preservation, and managed publish.'
  },
  {
    id: 'seeded-api',
    title: 'Seeded Brok API code:write access',
    requiredAny: [['SMOKE_SEED_TOKEN'], ['SMOKE_BROKCODE_API_KEY']],
    proof:
      'Run `bun run smoke:brokcode` with a scoped code:write key or seed token.'
  },
  {
    id: 'insforge',
    title: 'Live InsForge backend provision/apply/context/rewire',
    requiredAny: [
      ['INSFORGE_PROJECT_URL', 'INSFORGE_ACCESS_API_KEY'],
      [
        'BROKCODE_SHARED_INSFORGE_PROJECT_URL',
        'BROKCODE_SHARED_INSFORGE_ADMIN_KEY'
      ],
      ['BROKCODE_INSFORGE_SIGNUP_URL', 'BROKCODE_INSFORGE_SIGNUP_TOKEN']
    ],
    optional: [
      'BROKCODE_SHARED_INSFORGE_APP_KEY',
      'BROKCODE_SHARED_INSFORGE_DASHBOARD_URL',
      'BROKCODE_SHARED_INSFORGE_CLAIM_URL'
    ],
    proof:
      'Provision or attach a backend, apply schema with dryRun=false, fetch live context, and verify generated app uses only public InsForge config.'
  },
  {
    id: 'external-deploy',
    title: 'External one-click cloud deploy target',
    requiredAny: [
      ['BROKCODE_DEPLOY_WEBHOOK_URL'],
      ['RAILWAY_API_TOKEN', 'RAILWAY_ENVIRONMENT_ID', 'RAILWAY_SERVICE_ID']
    ],
    optional: [
      'BROKCODE_DEPLOY_WEBHOOK_BEARER',
      'RAILWAY_PROJECT_ID',
      'RAILWAY_PROJECT_NAME',
      'RAILWAY_SERVICE_NAME',
      'RAILWAY_ENVIRONMENT_NAME'
    ],
    proof:
      'Trigger webhook or Railway deploy from `/api/brokcode/deploy` and verify a reachable deployment URL is recorded.'
  },
  {
    id: 'github',
    title: 'GitHub repo context and approval-gated PR',
    requiredAny: [
      ['BROKCODE_GITHUB_TOKEN'],
      ['GITHUB_TOKEN'],
      ['GITHUB_ACCESS_TOKEN']
    ],
    optional: ['BROKCODE_DEFAULT_REPOSITORY', 'BROKCODE_GIT_DIR'],
    proof:
      'Load repo context, require explicit approval, create a PR, and record GitHub action history.'
  },
  {
    id: 'tui-sync',
    title: 'TUI/cloud session sync',
    requiredAny: [
      ['BROKCODE_SESSION_ID', 'BROKCODE_SYNC_URL'],
      ['SMOKE_SEED_TOKEN']
    ],
    optional: ['BROKCODE_PROJECT_ID', 'BROKCODE_CONFIG_PATH'],
    proof:
      'Run TUI sync against the same cloud session/project and verify versions/events appear in both surfaces.'
  }
]

const options = parseArgs(process.argv.slice(2))
if (options.help) {
  printHelp()
  process.exit(0)
}

const report = buildReport()
printReport(report)
await writeGithubSummary(report)

if (options.requireLive && !report.liveReady) {
  process.exitCode = 1
}

function parseArgs(args) {
  const parsed = { requireLive: false, help: false }
  for (const arg of args) {
    if (arg === '--require-live') parsed.requireLive = true
    else if (arg === '--help' || arg === '-h') parsed.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return parsed
}

function buildReport() {
  const groups = PROOF_GROUPS.map(group => {
    const satisfiedBy = group.requiredAny.find(names =>
      names.every(hasUsableEnv)
    )
    const missingSets = group.requiredAny
      .filter(names => names !== satisfiedBy)
      .map(names => names.filter(name => !hasUsableEnv(name)))
    const optionalPresent = (group.optional ?? []).filter(hasUsableEnv)
    return {
      ...group,
      ready: Boolean(satisfiedBy),
      satisfiedBy: satisfiedBy ?? [],
      missingSets,
      optionalPresent
    }
  })

  return {
    localGates: REQUIRED_LOCAL_GATES,
    groups,
    liveReady: groups.every(group => group.ready)
  }
}

function hasUsableEnv(name) {
  const value = process.env[name]
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  if (
    [
      '',
      'fake',
      'dummy',
      'invalid',
      'not-a-token',
      'not-a-key',
      'not-a-url',
      'changeme',
      'change-me',
      'placeholder',
      'todo',
      'test',
      'example'
    ].includes(normalized)
  ) {
    return false
  }
  return hasExpectedShape(name, value.trim())
}

function hasExpectedShape(name, value) {
  if (name === 'DATABASE_URL') return isPostgresUrl(value)

  if (name.endsWith('_URL') || name === 'BROKCODE_SYNC_URL') {
    return isHttpUrl(value)
  }

  if (
    [
      'SMOKE_BROKCODE_API_KEY',
      'BROKCODE_PROVIDER_API_KEY',
      'BROKCODE_OPENCODE_API_KEY',
      'PI_API_KEY',
      'INSFORGE_ACCESS_API_KEY',
      'BROKCODE_SHARED_INSFORGE_ADMIN_KEY',
      'BROKCODE_INSFORGE_SIGNUP_TOKEN',
      'BROKCODE_DEPLOY_WEBHOOK_BEARER',
      'RAILWAY_API_TOKEN',
      'SMOKE_SEED_TOKEN'
    ].includes(name)
  ) {
    return isLikelySecret(value)
  }

  if (
    ['BROKCODE_GITHUB_TOKEN', 'GITHUB_TOKEN', 'GITHUB_ACCESS_TOKEN'].includes(
      name
    )
  ) {
    return isLikelyGithubToken(value)
  }

  return true
}

function isPostgresUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'postgres:' || url.protocol === 'postgresql:'
  } catch {
    return false
  }
}

function isHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isLikelySecret(value) {
  if (value.length < 12) return false
  if (/^(brok_sk_|sk-|pi_|ik_|railway_|rw_|whsec_|opencode_)/i.test(value)) {
    return true
  }
  return /^[A-Za-z0-9._:/+=-]{20,}$/.test(value)
}

function isLikelyGithubToken(value) {
  return /^(ghp_|gho_|ghu_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]+$/.test(value)
}

function printReport(report) {
  console.log('Brok Builder readiness')
  console.log('')
  console.log('Local gates required before coordinator review:')
  for (const gate of report.localGates) console.log(`- ${gate}`)
  console.log('')
  console.log('Live proof groups:')
  for (const group of report.groups) {
    console.log(
      `${group.ready ? 'INPUTS PRESENT' : 'BLOCKED'} ${group.id}: ${group.title}`
    )
    if (group.ready) {
      console.log(`  present names: ${formatNames(group.satisfiedBy)}`)
    } else {
      console.log(
        `  needs one set: ${group.requiredAny
          .map(names => names.join(' + '))
          .join(' OR ')}`
      )
      console.log(
        `  missing now: ${formatNames(unique(group.missingSets.flat()))}`
      )
    }
    if (group.optionalPresent.length > 0) {
      console.log(`  optional present: ${formatNames(group.optionalPresent)}`)
    }
    console.log(`  proof: ${group.proof}`)
  }
  console.log('')
  console.log(
    report.liveReady
      ? 'All live proof input groups are configured. Run the live gates; input presence alone is not production proof.'
      : 'Live proof is not fully runnable in this environment yet.'
  )
}

async function writeGithubSummary(report) {
  const path = process.env.GITHUB_STEP_SUMMARY
  if (!path) return
  const lines = [
    '# Brok Builder readiness',
    '',
    `Live proof inputs: ${report.liveReady ? 'ready' : 'blocked'}`,
    '',
    '| Group | Status | Evidence |',
    '| --- | --- | --- |',
    ...report.groups.map(group => {
      const evidence = group.ready
        ? `present: ${formatNames(group.satisfiedBy)}`
        : `missing: ${formatNames(unique(group.missingSets.flat()))}`
      return `| ${group.id} | ${group.ready ? 'INPUTS PRESENT' : 'BLOCKED'} | ${evidence} |`
    })
  ]
  try {
    const { appendFile } = await import('node:fs/promises')
    await appendFile(path, `${lines.join('\n')}\n`)
  } catch {}
}

function formatNames(names) {
  return names.length ? names.join(', ') : 'none'
}

function unique(values) {
  return [...new Set(values)]
}

function printHelp() {
  console.log(`Usage: bun run scripts/check-brok-builder-readiness.mjs [--require-live]

Checks whether the current environment has the live inputs required to prove
Brok Builder/BrokCode readiness. Secret values are never printed.

Options:
  --require-live  Exit nonzero when any live proof input group is missing.
  -h, --help      Show this help.
`)
}
