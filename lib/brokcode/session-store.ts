import { and, desc, eq } from 'drizzle-orm'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { db } from '@/lib/db'
import { brokCodeSessionEvents, brokCodeSessions } from '@/lib/db/schema-brok'

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

function createSessionRowId(workspaceId: string, sessionId: string) {
  return `sess_${workspaceId}_${sessionId}`.replace(/[^a-zA-Z0-9._:-]/g, '-')
}

function canUseDatabaseStore() {
  return (
    process.env.BROKCODE_SYNC_STORAGE !== 'file' && !!process.env.DATABASE_URL
  )
}

function toIso(value: Date | string) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString()
}

function sourcesFrom(value: unknown): BrokCodeSessionSource[] {
  if (!Array.isArray(value)) return []
  return value.filter((source): source is BrokCodeSessionSource =>
    ['cloud', 'tui', 'api'].includes(source)
  )
}

function workspaceIdFrom(metadata?: Record<string, unknown>) {
  return typeof metadata?.workspaceId === 'string' ? metadata.workspaceId : null
}

function userIdFrom(metadata?: Record<string, unknown>) {
  return typeof metadata?.userId === 'string' ? metadata.userId : null
}

function buildSessionFromRows({
  session,
  events
}: {
  session: typeof brokCodeSessions.$inferSelect
  events: (typeof brokCodeSessionEvents.$inferSelect)[]
}): BrokCodeSession {
  const orderedEvents = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  return {
    id: session.sessionId,
    title: session.title,
    sources: sourcesFrom(session.sources),
    createdAt: toIso(session.createdAt),
    updatedAt: toIso(session.updatedAt),
    events: orderedEvents.map(event => {
      const metadata = {
        ...(event.metadata ?? {}),
        workspaceId:
          event.metadata?.workspaceId ??
          event.workspaceId ??
          session.workspaceId,
        userId: event.metadata?.userId ?? event.userId ?? session.userId
      }

      return {
        id: event.id,
        sessionId: event.sessionId,
        source: event.source as BrokCodeSessionSource,
        role: event.role as BrokCodeSessionRole,
        type: event.type,
        content: event.content,
        createdAt: toIso(event.createdAt),
        metadata
      }
    })
  }
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

export async function listBrokCodeSessions({
  workspaceId
}: {
  workspaceId?: string
} = {}) {
  if (canUseDatabaseStore()) {
    try {
      const rows = await db
        .select()
        .from(brokCodeSessions)
        .where(
          workspaceId
            ? eq(brokCodeSessions.workspaceId, workspaceId)
            : undefined
        )
        .orderBy(desc(brokCodeSessions.updatedAt))
        .limit(MAX_SESSIONS)

      return Promise.all(
        rows.map(async session => {
          const events = await db
            .select()
            .from(brokCodeSessionEvents)
            .where(eq(brokCodeSessionEvents.sessionRowId, session.rowId))
            .orderBy(desc(brokCodeSessionEvents.createdAt))
            .limit(MAX_EVENTS_PER_SESSION)

          return buildSessionFromRows({ session, events })
        })
      )
    } catch (error) {
      console.error('BrokCode session DB list failed; using file store:', error)
    }
  }

  const store = await readStore()
  return store.sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getBrokCodeSession(
  sessionId: string,
  workspaceId?: string
) {
  const id = sanitizeSessionId(sessionId)
  if (canUseDatabaseStore()) {
    try {
      const [session] = await db
        .select()
        .from(brokCodeSessions)
        .where(
          workspaceId
            ? and(
                eq(brokCodeSessions.sessionId, id),
                eq(brokCodeSessions.workspaceId, workspaceId)
              )
            : eq(brokCodeSessions.sessionId, id)
        )
        .limit(1)

      if (!session) return null

      const events = await db
        .select()
        .from(brokCodeSessionEvents)
        .where(eq(brokCodeSessionEvents.sessionRowId, session.rowId))
        .orderBy(desc(brokCodeSessionEvents.createdAt))
        .limit(MAX_EVENTS_PER_SESSION)

      return buildSessionFromRows({ session, events })
    } catch (error) {
      console.error(
        'BrokCode session DB lookup failed; using file store:',
        error
      )
    }
  }

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
  const workspaceId = workspaceIdFrom(metadata)
  const userId = userIdFrom(metadata)
  if (canUseDatabaseStore() && workspaceId && userId) {
    try {
      const id = sanitizeSessionId(sessionId)
      const rowId = createSessionRowId(workspaceId, id)
      const now = new Date()
      const fallbackTitle =
        content.trim().slice(0, 72) ||
        (source === 'tui' ? 'Terminal session' : 'Cloud session')
      const [existing] = await db
        .select()
        .from(brokCodeSessions)
        .where(
          and(
            eq(brokCodeSessions.sessionId, id),
            eq(brokCodeSessions.workspaceId, workspaceId)
          )
        )
        .limit(1)
      const sources = new Set(sourcesFrom(existing?.sources))
      sources.add(source)

      if (existing) {
        await db
          .update(brokCodeSessions)
          .set({
            title: sanitizeTitle(title, existing.title || fallbackTitle),
            sources: Array.from(sources),
            updatedAt: now
          })
          .where(eq(brokCodeSessions.rowId, existing.rowId))
      } else {
        await db.insert(brokCodeSessions).values({
          rowId,
          sessionId: id,
          workspaceId,
          userId,
          title: sanitizeTitle(title, fallbackTitle),
          sources: Array.from(sources),
          createdAt: now,
          updatedAt: now
        })
      }

      await db.insert(brokCodeSessionEvents).values({
        id: createId('event'),
        sessionRowId: existing?.rowId ?? rowId,
        sessionId: id,
        workspaceId,
        userId,
        source,
        role,
        type: type?.trim() || 'message',
        content: content.slice(0, MAX_CONTENT_LENGTH),
        metadata,
        createdAt: now
      })

      const session = await getBrokCodeSession(id, workspaceId)
      if (session) return session
    } catch (error) {
      console.error(
        'BrokCode session DB append failed; using file store:',
        error
      )
    }
  }

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
