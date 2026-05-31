import { createHash } from 'node:crypto'

import { GeneratedBrokCodeFile } from '@/lib/brokcode/generated-files'

export type BrokCodeFileOperation =
  | {
      type: 'create_file' | 'replace_file'
      path: string
      content: string
      expectedChecksum?: string | null
      summary?: string | null
    }
  | {
      type: 'patch_file'
      path: string
      search?: string | null
      replace?: string | null
      patch?: string | null
      expectedChecksum?: string | null
      summary?: string | null
    }
  | {
      type: 'delete_file'
      path: string
      expectedChecksum?: string | null
      summary?: string | null
    }
  | {
      type: 'rename_file'
      fromPath: string
      toPath: string
      expectedChecksum?: string | null
      summary?: string | null
    }

export type BrokCodeAppliedFileChange = {
  type: BrokCodeFileOperation['type']
  path: string
  toPath?: string
  beforeChecksum: string | null
  afterChecksum: string | null
  summary: string
}

export type BrokCodeFileOperationConflict = {
  path: string
  expectedChecksum: string | null
  actualChecksum: string | null
  message: string
}

export class BrokCodeFileOperationError extends Error {
  constructor(
    message: string,
    public code: 'invalid_operation' | 'conflict',
    public conflicts: BrokCodeFileOperationConflict[] = []
  ) {
    super(message)
    this.name = 'BrokCodeFileOperationError'
  }
}

export function checksumBrokCodeFileContent(content: string) {
  return createHash('sha256').update(content).digest('hex')
}

function normalizePath(path: string) {
  const normalized = path.trim().replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('..') || normalized.includes('\0')) {
    throw new BrokCodeFileOperationError(
      `Invalid file path: ${path}`,
      'invalid_operation'
    )
  }
  return normalized
}

function currentChecksum(content: string | null | undefined) {
  return typeof content === 'string'
    ? checksumBrokCodeFileContent(content)
    : null
}

function validateChecksum({
  path,
  expectedChecksum,
  actualChecksum,
  conflicts,
  applyAnyway
}: {
  path: string
  expectedChecksum?: string | null
  actualChecksum: string | null
  conflicts: BrokCodeFileOperationConflict[]
  applyAnyway: boolean
}) {
  if (!expectedChecksum || applyAnyway) return
  if (expectedChecksum === actualChecksum) return

  conflicts.push({
    path,
    expectedChecksum,
    actualChecksum,
    message:
      actualChecksum === null
        ? 'File is missing since the prompt context was packed.'
        : 'File changed since the prompt context was packed.'
  })
}

function hasConflictForPath(
  conflicts: BrokCodeFileOperationConflict[],
  path: string
) {
  return conflicts.some(conflict => conflict.path === path)
}

function applyPatchOperation({
  content,
  operation
}: {
  content: string
  operation: Extract<BrokCodeFileOperation, { type: 'patch_file' }>
}) {
  if (operation.search !== undefined && operation.replace !== undefined) {
    const search = operation.search ?? ''
    if (!search || !content.includes(search)) {
      throw new BrokCodeFileOperationError(
        `Patch search text was not found in ${operation.path}.`,
        'invalid_operation'
      )
    }
    return content.replace(search, operation.replace ?? '')
  }

  if (!operation.patch?.trim()) {
    throw new BrokCodeFileOperationError(
      `Patch operation for ${operation.path} is missing patch content.`,
      'invalid_operation'
    )
  }

  const removeLines: string[] = []
  const addLines: string[] = []
  for (const line of operation.patch.split(/\r?\n/)) {
    if (
      line.startsWith('---') ||
      line.startsWith('+++') ||
      line.startsWith('@@')
    ) {
      continue
    }
    if (line.startsWith('-')) removeLines.push(line.slice(1))
    if (line.startsWith('+')) addLines.push(line.slice(1))
  }

  const remove = removeLines.join('\n')
  if (!remove || !content.includes(remove)) {
    throw new BrokCodeFileOperationError(
      `Patch hunk did not match ${operation.path}.`,
      'invalid_operation'
    )
  }

  return content.replace(remove, addLines.join('\n'))
}

export function applyBrokCodeFileOperations({
  files,
  operations,
  applyAnyway = false
}: {
  files: GeneratedBrokCodeFile[]
  operations: BrokCodeFileOperation[]
  applyAnyway?: boolean
}) {
  const byPath = new Map(
    files.map(file => [
      normalizePath(file.path),
      { ...file, path: normalizePath(file.path) }
    ])
  )
  const conflicts: BrokCodeFileOperationConflict[] = []
  const changes: BrokCodeAppliedFileChange[] = []

  for (const operation of operations) {
    if (!operation || typeof operation !== 'object') {
      throw new BrokCodeFileOperationError(
        'Invalid file operation.',
        'invalid_operation'
      )
    }

    if (operation.type === 'rename_file') {
      const fromPath = normalizePath(operation.fromPath)
      const toPath = normalizePath(operation.toPath)
      const existing = byPath.get(fromPath)
      const beforeChecksum = currentChecksum(existing?.content)
      validateChecksum({
        path: fromPath,
        expectedChecksum: operation.expectedChecksum,
        actualChecksum: beforeChecksum,
        conflicts,
        applyAnyway
      })
      if (hasConflictForPath(conflicts, fromPath)) {
        continue
      }
      if (!existing) {
        throw new BrokCodeFileOperationError(
          `Cannot rename missing file ${fromPath}.`,
          'invalid_operation'
        )
      }
      if (fromPath === toPath) {
        throw new BrokCodeFileOperationError(
          `Cannot rename ${fromPath} to itself.`,
          'invalid_operation'
        )
      }
      const target = byPath.get(toPath)
      if (target) {
        conflicts.push({
          path: toPath,
          expectedChecksum: null,
          actualChecksum: currentChecksum(target.content),
          message: `Cannot rename ${fromPath} to ${toPath} because the target file already exists.`
        })
        continue
      }
      byPath.delete(fromPath)
      byPath.set(toPath, { ...existing, path: toPath })
      changes.push({
        type: operation.type,
        path: fromPath,
        toPath,
        beforeChecksum,
        afterChecksum: checksumBrokCodeFileContent(existing.content),
        summary: operation.summary ?? `Renamed ${fromPath} to ${toPath}.`
      })
      continue
    }

    const path = normalizePath(operation.path)
    const existing = byPath.get(path)
    const beforeChecksum = currentChecksum(existing?.content)
    validateChecksum({
      path,
      expectedChecksum: operation.expectedChecksum,
      actualChecksum: beforeChecksum,
      conflicts,
      applyAnyway
    })
    if (hasConflictForPath(conflicts, path)) {
      continue
    }

    if (operation.type === 'delete_file') {
      if (!existing) {
        throw new BrokCodeFileOperationError(
          `Cannot delete missing file ${path}.`,
          'invalid_operation'
        )
      }
      byPath.delete(path)
      changes.push({
        type: operation.type,
        path,
        beforeChecksum,
        afterChecksum: null,
        summary: operation.summary ?? `Deleted ${path}.`
      })
      continue
    }

    if (operation.type === 'create_file' && existing) {
      throw new BrokCodeFileOperationError(
        `Cannot create ${path} because it already exists.`,
        'invalid_operation'
      )
    }

    const content =
      operation.type === 'patch_file'
        ? applyPatchOperation({
            content: existing?.content ?? '',
            operation
          })
        : operation.content
    const language = path.split('.').pop() ?? null
    byPath.set(path, { path, content, language })
    changes.push({
      type: operation.type,
      path,
      beforeChecksum,
      afterChecksum: checksumBrokCodeFileContent(content),
      summary:
        operation.summary ?? `${operation.type.replace('_', ' ')} ${path}.`
    })
  }

  if (conflicts.length > 0) {
    throw new BrokCodeFileOperationError(
      'File operation conflict.',
      'conflict',
      conflicts
    )
  }

  return {
    files: [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path)),
    changes
  }
}

export function summarizeBrokCodeFullFileChanges({
  beforeFiles,
  afterFiles
}: {
  beforeFiles: GeneratedBrokCodeFile[]
  afterFiles: GeneratedBrokCodeFile[]
}) {
  const beforeByPath = new Map(
    beforeFiles.map(file => [normalizePath(file.path), file])
  )
  const changes: BrokCodeAppliedFileChange[] = []

  for (const file of afterFiles
    .map(item => ({ ...item, path: normalizePath(item.path) }))
    .sort((a, b) => a.path.localeCompare(b.path))) {
    const before = beforeByPath.get(file.path)
    const beforeChecksum = currentChecksum(before?.content)
    const afterChecksum = checksumBrokCodeFileContent(file.content)

    if (beforeChecksum === afterChecksum) continue

    changes.push({
      type: before ? 'replace_file' : 'create_file',
      path: file.path,
      beforeChecksum,
      afterChecksum,
      summary: before ? `Updated ${file.path}.` : `Created ${file.path}.`
    })
  }

  return changes
}
