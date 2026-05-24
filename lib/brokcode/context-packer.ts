import { BrokCodeBackendMetadata } from '@/lib/brokcode/backend-provider'

export type BrokCodeContextFile = {
  path: string
  content: string
  language?: string | null
}

export type BrokCodeContextProject = {
  id: string
  name: string
  slug?: string | null
  previewUrl?: string | null
  deploymentUrl?: string | null
  status?: string | null
  metadata?: Record<string, unknown> | null
}

export type BrokCodeProjectContextPackInput = {
  project: BrokCodeContextProject
  files: BrokCodeContextFile[]
  backend?: BrokCodeBackendMetadata | null
  activeVersionId?: string | null
  currentPreviewUrl?: string | null
  currentRoute?: string | null
  recentErrors?: string[]
  priorRequests?: string[]
}

const MAX_SELECTED_FILES = 10
const MAX_FILE_CHARS = 2200
const MAX_TOTAL_CHARS = 12000
const SECRET_PATH_PATTERN =
  /(^|\/)(\.env|\.npmrc|\.netrc|id_rsa|id_ed25519|secrets?)(\.|\/|$)|key|token|password/i
const SECRET_VALUE_PATTERN =
  /\b(api[_-]?key|token|secret|password|authorization|bearer)\b\s*[:=]\s*["']?[^"'\s,;]+/gi
const ENV_SECRET_PATTERN =
  /\b[A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*=["']?[^"'\s,;]+/g

function redact(value: string) {
  return value
    .replace(SECRET_VALUE_PATTERN, '$1=[redacted]')
    .replace(ENV_SECRET_PATTERN, match => {
      const [name] = match.split('=')
      return `${name}=[redacted]`
    })
}

function isSecretPath(path: string) {
  return SECRET_PATH_PATTERN.test(path)
}

function extensionScore(path: string) {
  if (
    /(^|\/)(package\.json|index\.html|vite\.config\.|next\.config\.)/i.test(
      path
    )
  ) {
    return 100
  }
  if (/(^|\/)(app|src)\/(page|layout|main|App)\.(tsx|ts|jsx|js)$/i.test(path)) {
    return 95
  }
  if (/\.(tsx|jsx|ts|js)$/i.test(path)) return 80
  if (/\.(css|scss|html)$/i.test(path)) return 70
  if (/\.(json|md)$/i.test(path)) return 45
  return 20
}

function inferAppShape(paths: string[]) {
  const lower = paths.map(path => path.toLowerCase())
  if (
    lower.some(path => path === 'next.config.ts' || path.startsWith('app/'))
  ) {
    return 'Next/full-stack'
  }
  if (
    lower.includes('vite.config.ts') ||
    lower.includes('vite.config.js') ||
    lower.some(path => path === 'src/main.tsx' || path === 'src/main.jsx')
  ) {
    return 'Vite app'
  }
  if (lower.includes('index.html')) return 'Static app'
  return 'Unknown app shape'
}

function truncateFile(content: string) {
  const redacted = redact(content)
  if (redacted.length <= MAX_FILE_CHARS) return redacted
  return `${redacted.slice(0, MAX_FILE_CHARS)}\n/* truncated */`
}

function selectImportantFiles(files: BrokCodeContextFile[]) {
  return files
    .filter(file => !isSecretPath(file.path))
    .map((file, index) => ({
      file,
      index,
      score: extensionScore(file.path)
    }))
    .sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path))
    .slice(0, MAX_SELECTED_FILES)
    .sort((a, b) => a.index - b.index)
    .map(entry => entry.file)
}

function metadataLine(project: BrokCodeContextProject) {
  const preview = project.metadata?.preview
  if (!preview || typeof preview !== 'object') return null

  const previewRecord = preview as Record<string, unknown>
  return [
    typeof previewRecord.mode === 'string'
      ? `mode=${previewRecord.mode}`
      : null,
    typeof previewRecord.fileCount === 'number'
      ? `files=${previewRecord.fileCount}`
      : null,
    typeof previewRecord.generatedAt === 'string'
      ? `generated=${previewRecord.generatedAt}`
      : null
  ]
    .filter(Boolean)
    .join(', ')
}

export function buildBrokCodeProjectContextPack({
  project,
  files,
  backend,
  activeVersionId,
  currentPreviewUrl,
  currentRoute,
  recentErrors = [],
  priorRequests = []
}: BrokCodeProjectContextPackInput) {
  const safeFiles = files
    .filter(file => file.path && !file.path.includes('..'))
    .sort((a, b) => a.path.localeCompare(b.path))
  const secretFiles = safeFiles.filter(file => isSecretPath(file.path))
  const visibleFiles = safeFiles.filter(file => !isSecretPath(file.path))
  const selectedFiles = selectImportantFiles(safeFiles)
  const paths = safeFiles.map(file => file.path)
  const selectedPaths = new Set(selectedFiles.map(file => file.path))
  const omittedCount = Math.max(0, visibleFiles.length - selectedFiles.length)
  const metadataSummary = metadataLine(project)
  const lines = [
    'Current BrokCode project context pack:',
    `Project: ${project.name} (${project.id})`,
    project.slug ? `Slug: ${project.slug}` : null,
    `App shape: ${inferAppShape(paths)}`,
    project.status ? `Project status: ${project.status}` : null,
    activeVersionId ? `Active version: ${activeVersionId}` : null,
    currentPreviewUrl || project.previewUrl
      ? `Preview: ${currentPreviewUrl ?? project.previewUrl}`
      : null,
    project.deploymentUrl ? `Deployment: ${project.deploymentUrl}` : null,
    currentRoute ? `Current route: ${currentRoute}` : null,
    backend
      ? `Backend: ${backend.provider} (${backend.status}; health ${backend.health})`
      : null,
    metadataSummary ? `Preview metadata: ${metadataSummary}` : null,
    secretFiles.length > 0
      ? `Secret/private files excluded: ${secretFiles.map(file => file.path).join(', ')}`
      : null,
    '',
    'File tree:',
    ...paths.map(
      path => `- ${path}${selectedPaths.has(path) ? ' (included)' : ''}`
    ),
    omittedCount > 0
      ? `Selected important files only; ${omittedCount} non-secret file${omittedCount === 1 ? '' : 's'} omitted or summarized.`
      : null,
    recentErrors.length > 0
      ? `Recent errors:\n${recentErrors.map(error => `- ${redact(error).slice(0, 400)}`).join('\n')}`
      : null,
    priorRequests.length > 0
      ? `Prior requested changes:\n${priorRequests.map(request => `- ${redact(request).slice(0, 280)}`).join('\n')}`
      : null,
    '',
    'Important current files:',
    ...selectedFiles.map(file =>
      [
        `--- ${file.path}${file.language ? ` (${file.language})` : ''} ---`,
        truncateFile(file.content)
      ].join('\n')
    ),
    '',
    'Follow-up edit rules:',
    '- Preserve existing working behavior and user-facing flows unless the user explicitly asks to replace them.',
    '- Edit the current app in place using the files above; do not regenerate an unrelated app.',
    '- Keep routes, backend contracts, auth/storage config, and preview behavior compatible with the current project.',
    '- If a needed file is omitted, ask BrokCode to inspect or infer it from the file tree instead of inventing secrets.'
  ].filter((line): line is string => typeof line === 'string')

  const pack = lines.join('\n')
  if (pack.length <= MAX_TOTAL_CHARS) return pack
  return `${pack.slice(0, MAX_TOTAL_CHARS)}\n\n[Context pack truncated deterministically at ${MAX_TOTAL_CHARS} characters.]`
}
