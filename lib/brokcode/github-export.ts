import { makeBrokCodeSlug } from '@/lib/brokcode/project-store'

export type BrokCodeGithubExportFileInput = {
  path: string
  content: string
}

export type BrokCodeGithubExportFile = {
  path: string
  content: string
}

const MAX_EXPORT_FILES = 500
const MAX_EXPORT_FILE_BYTES = 1_000_000

function normalizePathPart(part: string) {
  return part.trim().replace(/^\/+|\/+$/g, '')
}

export function sanitizeGithubExportPath(value: unknown) {
  if (typeof value !== 'string') return ''

  const path = value.split('/').map(normalizePathPart).filter(Boolean).join('/')

  if (!path) return ''
  const parts = path.split('/')
  if (
    parts.some(
      part =>
        part === '.' || part === '..' || part === '.git' || part.includes('\0')
    )
  ) {
    return ''
  }

  return path
}

function sanitizeProjectFilePath(value: string) {
  const path = value
    .split('/')
    .map(normalizePathPart)
    .filter(part => Boolean(part) && part !== '.')
    .join('/')

  if (!path) return null
  const parts = path.split('/')
  if (
    parts.some(
      part =>
        part === '..' ||
        part === '.git' ||
        part === 'node_modules' ||
        part.includes('\0')
    )
  ) {
    return null
  }

  return path
}

export function normalizeGithubExportFiles({
  files,
  exportPath = ''
}: {
  files: BrokCodeGithubExportFileInput[]
  exportPath?: string
}) {
  const root = sanitizeGithubExportPath(exportPath)
  const seen = new Set<string>()
  const normalized: BrokCodeGithubExportFile[] = []

  for (const file of files) {
    if (normalized.length >= MAX_EXPORT_FILES) break
    if (typeof file.content !== 'string') continue

    const relativePath = sanitizeProjectFilePath(file.path)
    if (!relativePath) continue

    const byteLength = new TextEncoder().encode(file.content).byteLength
    if (byteLength > MAX_EXPORT_FILE_BYTES) continue

    const path = root ? `${root}/${relativePath}` : relativePath
    if (seen.has(path)) continue

    seen.add(path)
    normalized.push({
      path,
      content: file.content
    })
  }

  return normalized.sort((a, b) => a.path.localeCompare(b.path))
}

export function buildGithubExportBranchName({
  projectName,
  projectId
}: {
  projectName?: string | null
  projectId?: string | null
}) {
  const slug = makeBrokCodeSlug(projectName || 'brokcode-project').slice(0, 40)
  const suffix = (projectId || Date.now().toString(36))
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(-8)

  return `brokcode/${slug}-${suffix || Date.now().toString(36)}`
}

export function buildGithubExportCommitMessage({
  projectId,
  versionId
}: {
  projectId?: string | null
  versionId?: string | null
}) {
  const parts = ['Export BrokCode project']
  if (projectId) parts.push(`project ${projectId}`)
  if (versionId) parts.push(`version ${versionId}`)
  return parts.join(' - ')
}

export function buildGithubExportPullRequestBody({
  body,
  projectId,
  versionId,
  exportPath,
  files
}: {
  body?: string
  projectId?: string | null
  versionId?: string | null
  exportPath?: string
  files: BrokCodeGithubExportFile[]
}) {
  const previewFiles = files.slice(0, 20).map(file => `- ${file.path}`)
  const hiddenCount = files.length - previewFiles.length
  const lines = [
    body?.trim() || 'Opened by Brok Code Cloud.',
    '',
    'BrokCode export:',
    projectId ? `- Project: ${projectId}` : null,
    versionId ? `- Version: ${versionId}` : null,
    `- Export path: ${exportPath || '/'}`,
    `- Files committed: ${files.length}`,
    '',
    'Files:',
    ...previewFiles,
    hiddenCount > 0 ? `- ...and ${hiddenCount} more` : null
  ].filter((line): line is string => Boolean(line))

  return lines.join('\n').slice(0, 65_000)
}
