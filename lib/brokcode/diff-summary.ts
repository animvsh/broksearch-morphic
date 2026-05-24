export type BrokCodeDiffFileInput = {
  path: string
  content: string
  language?: string | null
}

export type BrokCodeDiffFileStatus = 'created' | 'modified' | 'deleted'

export type BrokCodeDiffFile = {
  path: string
  status: BrokCodeDiffFileStatus
  language?: string | null
  before: string | null
  after: string | null
  beforeSize: number
  afterSize: number
  additions: number
  deletions: number
  truncated: boolean
}

export type BrokCodeRunDiff = {
  id: string
  command: string
  summary: string
  createdAt: string
  jobId?: string | null
  versionId?: string | null
  previewUrl?: string | null
  files: BrokCodeDiffFile[]
  createdCount: number
  modifiedCount: number
  deletedCount: number
  totalFilesChanged: number
  runtimeChanges: string[]
  deployChanges: string[]
  truncated: boolean
}

const MAX_FILE_CONTENT_CHARS = 20000

function fileMap(files: BrokCodeDiffFileInput[]) {
  return new Map(files.map(file => [file.path, file]))
}

function trimContent(content: string | null) {
  if (content === null) return { content, truncated: false }
  if (content.length <= MAX_FILE_CONTENT_CHARS) {
    return { content, truncated: false }
  }

  return {
    content: `${content.slice(0, MAX_FILE_CONTENT_CHARS)}\n...`,
    truncated: true
  }
}

function countChangedLines(before: string, after: string) {
  const beforeCounts = new Map<string, number>()
  const afterCounts = new Map<string, number>()

  before.split('\n').forEach(line => {
    beforeCounts.set(line, (beforeCounts.get(line) ?? 0) + 1)
  })
  after.split('\n').forEach(line => {
    afterCounts.set(line, (afterCounts.get(line) ?? 0) + 1)
  })

  let shared = 0
  beforeCounts.forEach((count, line) => {
    shared += Math.min(count, afterCounts.get(line) ?? 0)
  })

  return {
    additions: Math.max(0, after.split('\n').length - shared),
    deletions: Math.max(0, before.split('\n').length - shared)
  }
}

function summarizeDiff(files: BrokCodeDiffFile[]) {
  const created = files.filter(file => file.status === 'created').length
  const modified = files.filter(file => file.status === 'modified').length
  const deleted = files.filter(file => file.status === 'deleted').length
  const parts = [
    created ? `${created} created` : null,
    modified ? `${modified} modified` : null,
    deleted ? `${deleted} deleted` : null
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(', ') : 'No file changes'
}

export function buildBrokCodeRunDiff({
  id,
  command,
  beforeFiles,
  afterFiles,
  createdAt = new Date().toISOString(),
  jobId = null,
  versionId = null,
  previewUrl = null,
  runtimeChanges = [],
  deployChanges = []
}: {
  id: string
  command: string
  beforeFiles: BrokCodeDiffFileInput[]
  afterFiles: BrokCodeDiffFileInput[]
  createdAt?: string
  jobId?: string | null
  versionId?: string | null
  previewUrl?: string | null
  runtimeChanges?: string[]
  deployChanges?: string[]
}): BrokCodeRunDiff {
  const before = fileMap(beforeFiles)
  const after = fileMap(afterFiles)
  const paths = Array.from(new Set([...before.keys(), ...after.keys()])).sort()

  const files = paths.flatMap(path => {
    const beforeFile = before.get(path) ?? null
    const afterFile = after.get(path) ?? null
    if (beforeFile?.content === afterFile?.content) return []

    const status: BrokCodeDiffFileStatus = beforeFile
      ? afterFile
        ? 'modified'
        : 'deleted'
      : 'created'
    const beforeContent = trimContent(beforeFile?.content ?? null)
    const afterContent = trimContent(afterFile?.content ?? null)
    const changedLines = countChangedLines(
      beforeFile?.content ?? '',
      afterFile?.content ?? ''
    )

    return [
      {
        path,
        status,
        language: afterFile?.language ?? beforeFile?.language ?? null,
        before: beforeContent.content,
        after: afterContent.content,
        beforeSize: beforeFile?.content.length ?? 0,
        afterSize: afterFile?.content.length ?? 0,
        additions:
          status === 'created'
            ? (afterFile?.content.split('\n').length ?? 0)
            : changedLines.additions,
        deletions:
          status === 'deleted'
            ? (beforeFile?.content.split('\n').length ?? 0)
            : changedLines.deletions,
        truncated: beforeContent.truncated || afterContent.truncated
      } satisfies BrokCodeDiffFile
    ]
  })

  const createdCount = files.filter(file => file.status === 'created').length
  const modifiedCount = files.filter(file => file.status === 'modified').length
  const deletedCount = files.filter(file => file.status === 'deleted').length

  return {
    id,
    command,
    summary: summarizeDiff(files),
    createdAt,
    jobId,
    versionId,
    previewUrl,
    files,
    createdCount,
    modifiedCount,
    deletedCount,
    totalFilesChanged: files.length,
    runtimeChanges,
    deployChanges,
    truncated: files.some(file => file.truncated)
  }
}
