import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

export type SecretFinding = {
  file: string
  line: number
  rule: string
}

type SecretRule = {
  name: string
  pattern: RegExp
}

const HIGH_CONFIDENCE_RULES: SecretRule[] = [
  {
    name: 'private-key-block',
    pattern: /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/i
  },
  {
    name: 'openai-api-key',
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/
  },
  {
    name: 'anthropic-api-key',
    pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/
  },
  {
    name: 'github-token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/
  },
  {
    name: 'aws-access-key',
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/
  },
  {
    name: 'stripe-live-secret',
    pattern: /\bsk_live_[A-Za-z0-9]{20,}\b/
  },
  {
    name: 'slack-token',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/
  },
  {
    name: 'brok-live-api-key',
    pattern: /\bbrok_sk_(?:live|test)_[A-Za-z0-9_-]{20,}\b/
  },
  {
    name: 'supabase-service-role-jwt',
    pattern:
      /\bSUPABASE_SERVICE_ROLE_KEY\s*=\s*eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/
  }
]

const ENV_ASSIGNMENT =
  /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*["']?([^"'\s#]+)/

const PLACEHOLDER_WORDS = [
  'changeme',
  'change-me',
  'change_before',
  'example',
  'fake',
  'placeholder',
  'replace',
  'sample',
  'test',
  'todo',
  'your',
  '[your',
  '<your'
]

const TEXT_FILE_EXTENSIONS = new Set([
  '',
  '.cjs',
  '.css',
  '.env',
  '.example',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.mts',
  '.sql',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml'
])

const SKIP_PATH_PREFIXES = [
  '.git/',
  '.next/',
  '.turbo/',
  'coverage/',
  'node_modules/',
  'out/'
]

const SKIP_PATH_PARTS = [
  '/.git/',
  '/.next/',
  '/.turbo/',
  '/coverage/',
  '/node_modules/',
  '/out/'
]

export function listGitCandidateFiles({
  includeUntracked = true,
  stagedOnly = false
}: {
  includeUntracked?: boolean
  stagedOnly?: boolean
} = {}): string[] {
  const args = stagedOnly
    ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']
    : includeUntracked
      ? ['ls-files', '-z', '--cached', '--others', '--exclude-standard']
      : ['ls-files', '-z', '--cached']

  const output = execFileSync('git', args, { encoding: 'utf8' })
  return output
    .split('\0')
    .map(file => file.trim())
    .filter(Boolean)
    .filter(shouldScanPath)
}

export function scanFileContent(
  file: string,
  content: string
): SecretFinding[] {
  const findings: SecretFinding[] = []
  const lines = content.split(/\r?\n/)

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const lineNumber = index + 1

    for (const rule of HIGH_CONFIDENCE_RULES) {
      rule.pattern.lastIndex = 0
      if (rule.pattern.test(line) && !isAllowedExampleLine(line)) {
        findings.push({ file, line: lineNumber, rule: rule.name })
      }
    }

    const assignment = line.match(ENV_ASSIGNMENT)
    if (assignment) {
      const [, name, rawValue] = assignment
      if (
        isSensitiveEnvName(name) &&
        looksLikeCommittedSecret(name, rawValue)
      ) {
        findings.push({
          file,
          line: lineNumber,
          rule: 'suspicious-env-assignment'
        })
      }
    }
  }

  return dedupeFindings(findings)
}

export function scanFiles(files: string[]): SecretFinding[] {
  const findings: SecretFinding[] = []

  for (const file of files) {
    let content = ''
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }

    findings.push(...scanFileContent(file, content))
  }

  return findings
}

export function shouldScanPath(file: string): boolean {
  if (
    SKIP_PATH_PREFIXES.some(prefix => file.startsWith(prefix)) ||
    SKIP_PATH_PARTS.some(part => file.includes(part))
  ) {
    return false
  }

  const lower = file.toLowerCase()
  if (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.ico') ||
    lower.endsWith('.pdf') ||
    lower.endsWith('.zip')
  ) {
    return false
  }

  const dotIndex = lower.lastIndexOf('.')
  const extension = dotIndex === -1 ? '' : lower.slice(dotIndex)
  return TEXT_FILE_EXTENSIONS.has(extension)
}

export function formatFindings(findings: SecretFinding[]): string {
  return findings
    .map(finding => `${finding.file}:${finding.line} ${finding.rule}`)
    .join('\n')
}

function isSensitiveEnvName(name: string): boolean {
  return (
    name.endsWith('API_KEY') ||
    name.endsWith('KEY') ||
    name.endsWith('TOKEN') ||
    name.endsWith('SECRET') ||
    name.endsWith('PASSWORD') ||
    name === 'DATABASE_URL' ||
    name === 'DATABASE_RESTRICTED_URL'
  )
}

function looksLikeCommittedSecret(name: string, rawValue: string): boolean {
  const value = rawValue.trim()
  if (!value || isPlaceholderValue(value)) return false

  if (name === 'DATABASE_URL' || name === 'DATABASE_RESTRICTED_URL') {
    return looksLikeRealDatabaseUrl(value)
  }

  if (value.length < 20) return false

  return !isAllowedExampleLine(value)
}

function looksLikeRealDatabaseUrl(value: string): boolean {
  if (!/^postgres(?:ql)?:\/\//i.test(value)) return false
  if (
    /(?:localhost|127\.0\.0\.1)/i.test(value) &&
    /:\/\/[^:\s]+:password@/i.test(value)
  ) {
    return false
  }
  if (/\[your|<your|user:password/i.test(value)) {
    return false
  }
  return /:\/\/[^:\s]+:[^@\s]+@/.test(value)
}

function isPlaceholderValue(value: string): boolean {
  const normalized = value.toLowerCase()
  return (
    /^\$\{[A-Z][A-Z0-9_]*\}$/.test(value) ||
    PLACEHOLDER_WORDS.some(word => normalized.includes(word)) ||
    /^\[.*\]$/.test(value) ||
    /^<.*>$/.test(value) ||
    /^\.{3,}$/.test(value)
  )
}

function isAllowedExampleLine(line: string): boolean {
  const normalized = line.toLowerCase()
  return (
    normalized.includes('brok_sk_local_smoke') ||
    normalized.includes('brok_sk_...') ||
    normalized.includes('smoke_seed_token=...') ||
    normalized.includes('$smoke_seed_token') ||
    normalized.includes('$brok_api_key') ||
    normalized.includes('process.env.')
  )
}

function dedupeFindings(findings: SecretFinding[]): SecretFinding[] {
  const seen = new Set<string>()
  return findings.filter(finding => {
    const key = `${finding.file}:${finding.line}:${finding.rule}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
