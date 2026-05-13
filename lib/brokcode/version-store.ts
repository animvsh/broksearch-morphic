import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type BrokCodeVersion = {
  id: string
  sessionId: string
  workspaceId?: string
  userId?: string
  command: string
  summary: string
  runtime: 'pi' | 'opencode' | 'brok' | 'not_connected'
  status: 'done' | 'error'
  previewUrl?: string | null
  branch?: string | null
  commitSha?: string | null
  prUrl?: string | null
  createdAt: string
}

type BrokCodeVersionFile = {
  versions: BrokCodeVersion[]
}

const MAX_VERSIONS = 250
let writeQueue: Promise<unknown> = Promise.resolve()

function getVersionsFilePath() {
  return path.join(
    process.env.BROKCODE_SYNC_DIR ??
      path.join(process.cwd(), '.brokcode', 'sync'),
    'versions.json'
  )
}

function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`
}

function sanitizeSessionId(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return 'default'
  }

  return value
    .trim()
    .replace(/[^a-zA-Z0-9._:-]/g, '-')
    .slice(0, 80)
}

function truncate(value: unknown, limit: number, fallback = '') {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmed = value.trim()
  if (!trimmed) return fallback
  return trimmed.slice(0, limit)
}

function truncateNullable(value: unknown, limit: number) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, limit)
}

async function readStore(): Promise<BrokCodeVersionFile> {
  try {
    const raw = await readFile(getVersionsFilePath(), 'utf8')
    const parsed = JSON.parse(raw) as BrokCodeVersionFile
    if (Array.isArray(parsed.versions)) {
      return parsed
    }
  } catch {}

  return { versions: [] }
}

async function writeStore(store: BrokCodeVersionFile) {
  const filePath = getVersionsFilePath()
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(store, null, 2), 'utf8')
}

export async function listBrokCodeVersions({
  sessionId,
  workspaceId
}: {
  sessionId?: string
  workspaceId?: string
} = {}) {
  const store = await readStore()
  const filtered = store.versions.filter(version => {
    if (sessionId && version.sessionId !== sanitizeSessionId(sessionId)) {
      return false
    }

    if (workspaceId && version.workspaceId !== workspaceId) {
      return false
    }

    return true
  })

  return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function createBrokCodeVersion(input: {
  sessionId?: string
  workspaceId?: string
  userId?: string
  command: string
  summary: string
  runtime: BrokCodeVersion['runtime']
  status: BrokCodeVersion['status']
  previewUrl?: string | null
  branch?: string | null
  commitSha?: string | null
  prUrl?: string | null
}) {
  const operation = writeQueue.then(async () => {
    const store = await readStore()
    const now = new Date().toISOString()

    const version: BrokCodeVersion = {
      id: createId('ver'),
      sessionId: sanitizeSessionId(input.sessionId),
      workspaceId: truncateNullable(input.workspaceId, 200) ?? undefined,
      userId: truncateNullable(input.userId, 200) ?? undefined,
      command: truncate(input.command, 1000, 'Untitled command'),
      summary: truncate(input.summary, 3000, 'No summary'),
      runtime: input.runtime,
      status: input.status,
      previewUrl: truncateNullable(input.previewUrl, 2000),
      branch: truncateNullable(input.branch, 200),
      commitSha: truncateNullable(input.commitSha, 120),
      prUrl: truncateNullable(input.prUrl, 2000),
      createdAt: now
    }

    const nextVersions = [version, ...store.versions]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, MAX_VERSIONS)

    await writeStore({ versions: nextVersions })
    return version
  })

  writeQueue = operation.catch(() => {})
  return operation
}
