#!/usr/bin/env bun

import {
  formatFindings,
  listGitCandidateFiles,
  scanFiles
} from './secret-scan-core'

const options = parseArgs(process.argv.slice(2))
const includeUntracked = !options.trackedOnly

if (options.help) {
  console.log(`Secret scanner

Usage:
  bun run scan:secrets
  bun run scan:secrets -- --staged
  bun run scripts/scan-secrets.ts -- --tracked
  bun run scan:secrets -- --env-file .env.local

Scans tracked files and untracked, non-ignored files by default. It reports only
file, line, and rule names; matched secret values are never printed.

Use --env-file to opt into scanning ignored local env files during rotation
audits. Findings still redact the matched values.`)
  process.exit(0)
}

const files = uniqueList([
  ...listGitCandidateFiles({
    includeUntracked,
    stagedOnly: options.stagedOnly
  }),
  ...options.envFiles
])
const findings = scanFiles(files)

if (findings.length > 0) {
  console.error('Potential secrets found:')
  console.error(formatFindings(findings))
  console.error(
    '\nRotate exposed values, replace committed values with placeholders, and keep real values in local or deployment secret stores.'
  )
  process.exit(1)
}

console.log(`secret scan ok (${files.length} files checked)`)

function parseArgs(args: string[]) {
  const parsed = {
    envFiles: [] as string[],
    help: false,
    stagedOnly: false,
    trackedOnly: false
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const next = args[index + 1]

    if (arg === '--help' || arg === '-h') parsed.help = true
    else if (arg === '--staged') parsed.stagedOnly = true
    else if (arg === '--tracked') parsed.trackedOnly = true
    else if (arg === '--env-file') {
      if (!next || next.startsWith('--')) {
        throw new Error('--env-file requires a path')
      }
      parsed.envFiles.push(next)
      index += 1
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return parsed
}

function uniqueList(values: string[]) {
  return [...new Set(values)]
}
