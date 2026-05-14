import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type BrokCodeSessionSource = 'cloud' | 'tui' | 'api'
export type BrokCodeSessionRole = 'user' | 'assistant' | 'system'

export type BrokCodeSessionEvent = {
  id: string
  sessionId: string
  source: BrokCodeSessionSource
  role: BrokCodeSessionRole
  type: string
  content: string
  createdAt: string
  metadata?: Record<string, unknown>
}

export type BrokCodeSession = {
  id: string
  title: string
  sources: BrokCodeSessionSource[]
  createdAt: string
  updatedAt: string
  events: BrokCodeSessionEvent[]
}

type BrokCodeSessionFile = {
  sessions: BrokCodeSession[]
}

const MAX_SESSIONS = 40
const MAX_EVENTS_PER_SESSION = 240
const MAX_CONTENT_LENGTH = 12000
let writeQueue: Promise<unknown> = Promise.resolve()

function getSyncFilePath() {
  return path.join(
    process.env.BROKCODE_SYNC_DIR ??
      path.join(process.cwd(), '.brokcode', 'sync'),
    'sessions.json'
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

function sanitizeTitle(value: unknown, fallback: string) {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback
  }

  return value.trim().slice(0, 140)
}

async function readStore(): Promise<BrokCodeSessionFile> {
  try {
    const raw = await readFile(getSyncFilePath(), 'utf8')
    const parsed = JSON.parse(raw) as BrokCodeSessionFile
    if (Array.isArray(parsed.sessions)) {
      return parsed
    }
  } catch {}

  return { sessions: [] }
}

async function writeStore(store: BrokCodeSessionFile) {
  const filePath = getSyncFilePath()
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(store, null, 2), 'utf8')
}

export async function listBrokCodeSessions() {
  const store = await readStore()
  return store.sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getBrokCodeSession(sessionId: string) {
  const id = sanitizeSessionId(sessionId)
  const store = await readStore()
  return store.sessions.find(session => session.id === id) ?? null
}

export async function appendBrokCodeSessionEvent({
  sessionId,
  source,
  role,
  type,
  content,
  title,
  metadata
}: {
  sessionId?: string
  source: BrokCodeSessionSource
  role: BrokCodeSessionRole
  type?: string
  content: string
  title?: string
  metadata?: Record<string, unknown>
}) {
  const operation = writeQueue.then(async () => {
    const id = sanitizeSessionId(sessionId)
    const now = new Date().toISOString()
    const store = await readStore()
    const existingIndex = store.sessions.findIndex(session => session.id === id)
    const fallbackTitle =
      content.trim().slice(0, 72) ||
      (source === 'tui' ? 'Terminal session' : 'Cloud session')

    const event: BrokCodeSessionEvent = {
      id: createId('event'),
      sessionId: id,
      source,
      role,
      type: type?.trim() || 'message',
      content: content.slice(0, MAX_CONTENT_LENGTH),
      createdAt: now,
      ...(metadata ? { metadata } : {})
    }

    const session =
      existingIndex >= 0
        ? store.sessions[existingIndex]
        : {
            id,
            title: sanitizeTitle(title, fallbackTitle),
            sources: [],
            createdAt: now,
            updatedAt: now,
            events: []
          }

    const sources = new Set(session.sources)
    sources.add(source)

    const updatedSession: BrokCodeSession = {
      ...session,
      title: sanitizeTitle(title, session.title || fallbackTitle),
      sources: Array.from(sources),
      updatedAt: now,
      events: [...session.events, event].slice(-MAX_EVENTS_PER_SESSION)
    }

    const nextSessions =
      existingIndex >= 0
        ? store.sessions.map((session, index) =>
            index === existingIndex ? updatedSession : session
          )
        : [updatedSession, ...store.sessions]

    await writeStore({
      sessions: nextSessions
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, MAX_SESSIONS)
    })

    return updatedSession
  })

  writeQueue = operation.catch(() => {})
  return operation
}
