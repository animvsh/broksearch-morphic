import { and, desc, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  BrokCodeRuntimeHealth,
  BrokCodeRuntimeSpec,
  BrokCodeRuntimeStatus,
  normalizeBrokCodeRuntimeStatus
} from '@/lib/brokcode/runtime/contract'
import { db } from '@/lib/db'
import { brokCodeRuntimeSandboxes } from '@/lib/db/schema'

export type BrokCodeRuntimeSandbox =
  typeof brokCodeRuntimeSandboxes.$inferSelect

type RuntimeStoreFile = {
  runtimes: BrokCodeRuntimeSandbox[]
}

let runtimeWriteQueue: Promise<unknown> = Promise.resolve()

function canUseDatabaseStore() {
  return (
    process.env.BROKCODE_PROJECT_STORAGE !== 'file' &&
    !!process.env.DATABASE_URL
  )
}

function getRuntimeStorePath() {
  return path.join(
    process.env.BROKCODE_SYNC_DIR ??
      path.join(process.cwd(), '.brokcode', 'sync'),
    'runtime-sandboxes.json'
  )
}

function asDate(value: Date | string | null | undefined) {
  if (value instanceof Date || value === null) return value
  const parsed = value ? new Date(value) : new Date()
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function normalizeRuntime(
  runtime: BrokCodeRuntimeSandbox
): BrokCodeRuntimeSandbox {
  return {
    ...runtime,
    startedAt: asDate(runtime.startedAt),
    stoppedAt: asDate(runtime.stoppedAt),
    lastHealthcheckAt: asDate(runtime.lastHealthcheckAt),
    createdAt: asDate(runtime.createdAt) ?? new Date(),
    updatedAt: asDate(runtime.updatedAt) ?? new Date()
  }
}

async function readRuntimeStore(): Promise<RuntimeStoreFile> {
  try {
    const raw = await readFile(getRuntimeStorePath(), 'utf8')
    const parsed = JSON.parse(raw) as RuntimeStoreFile
    return {
      runtimes: Array.isArray(parsed.runtimes)
        ? parsed.runtimes.map(normalizeRuntime)
        : []
    }
  } catch {}

  return { runtimes: [] }
}

async function writeRuntimeStore(store: RuntimeStoreFile) {
  const filePath = getRuntimeStorePath()
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(store, null, 2), 'utf8')
}

function queueRuntimeStoreWrite(
  updater: (store: RuntimeStoreFile) => RuntimeStoreFile
) {
  runtimeWriteQueue = runtimeWriteQueue.then(async () => {
    const store = await readRuntimeStore()
    await writeRuntimeStore(updater(store))
  })

  return runtimeWriteQueue
}

function createRuntimeValue({
  spec,
  health
}: {
  spec: BrokCodeRuntimeSpec
  health?: BrokCodeRuntimeHealth | null
}) {
  return {
    projectId: spec.projectId,
    workspaceId: spec.workspaceId,
    userId: spec.userId,
    versionId: spec.versionId ?? null,
    sessionId: spec.sessionId ?? null,
    institutionId: spec.context.institutionId ?? null,
    courseId: spec.context.courseId ?? null,
    sectionId: spec.context.sectionId ?? null,
    assignmentId: spec.context.assignmentId ?? null,
    appType: spec.appType,
    packageManager: spec.packageManager,
    workspacePath: spec.workspacePath,
    installCommand: spec.installCommand,
    devCommand: spec.devCommand,
    buildCommand: spec.buildCommand,
    status: spec.status,
    ports: spec.ports,
    logs: [],
    health: health ?? null,
    metadata: spec.metadata,
    startedAt: null,
    stoppedAt: null,
    lastHealthcheckAt: health?.checkedAt ? new Date(health.checkedAt) : null,
    updatedAt: new Date()
  }
}

export async function createBrokCodeRuntimeSandbox({
  spec,
  health
}: {
  spec: BrokCodeRuntimeSpec
  health?: BrokCodeRuntimeHealth | null
}) {
  const value = createRuntimeValue({ spec, health })

  if (canUseDatabaseStore()) {
    try {
      const [runtime] = await db
        .insert(brokCodeRuntimeSandboxes)
        .values(value)
        .returning()

      return runtime
    } catch (error) {
      console.error(
        'BrokCode runtime DB create failed; using file store:',
        error
      )
    }
  }

  const now = new Date()
  const runtime: BrokCodeRuntimeSandbox = {
    id: randomUUID(),
    ...value,
    createdAt: now,
    updatedAt: now
  }

  await queueRuntimeStoreWrite(store => ({
    runtimes: [...store.runtimes, runtime]
  }))

  return runtime
}

export async function listBrokCodeRuntimeSandboxes({
  projectId,
  workspaceId,
  userId
}: {
  projectId: string
  workspaceId: string
  userId: string
}) {
  if (canUseDatabaseStore()) {
    try {
      return await db
        .select()
        .from(brokCodeRuntimeSandboxes)
        .where(
          and(
            eq(brokCodeRuntimeSandboxes.projectId, projectId),
            eq(brokCodeRuntimeSandboxes.workspaceId, workspaceId),
            eq(brokCodeRuntimeSandboxes.userId, userId)
          )
        )
        .orderBy(desc(brokCodeRuntimeSandboxes.updatedAt))
    } catch (error) {
      console.error('BrokCode runtime DB list failed; using file store:', error)
    }
  }

  const store = await readRuntimeStore()
  return store.runtimes
    .filter(
      runtime =>
        runtime.projectId === projectId &&
        runtime.workspaceId === workspaceId &&
        runtime.userId === userId
    )
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
}

export async function getLatestBrokCodeRuntimeSandbox({
  projectId,
  workspaceId,
  userId
}: {
  projectId: string
  workspaceId: string
  userId: string
}) {
  const [runtime] = await listBrokCodeRuntimeSandboxes({
    projectId,
    workspaceId,
    userId
  })

  return runtime ?? null
}

export async function getBrokCodeRuntimeSandboxById({ id }: { id: string }) {
  if (canUseDatabaseStore()) {
    try {
      const [runtime] = await db
        .select()
        .from(brokCodeRuntimeSandboxes)
        .where(eq(brokCodeRuntimeSandboxes.id, id))
        .limit(1)

      return runtime ?? null
    } catch (error) {
      console.error('BrokCode runtime DB get failed; using file store:', error)
    }
  }

  const store = await readRuntimeStore()
  return store.runtimes.find(runtime => runtime.id === id) ?? null
}

export async function refreshBrokCodeRuntimeSandbox(
  runtime: BrokCodeRuntimeSandbox | null | undefined
) {
  if (!runtime) return null

  return (await getBrokCodeRuntimeSandboxById({ id: runtime.id })) ?? runtime
}

export async function updateBrokCodeRuntimeSandbox({
  id,
  workspaceId,
  userId,
  status,
  logs,
  health,
  metadata
}: {
  id: string
  workspaceId: string
  userId: string
  status?: BrokCodeRuntimeStatus
  logs?: Array<Record<string, unknown>>
  health?: BrokCodeRuntimeHealth | null
  metadata?: Record<string, unknown>
}) {
  const nextStatus = status ? normalizeBrokCodeRuntimeStatus(status) : undefined
  const now = new Date()
  const patch = {
    ...(nextStatus ? { status: nextStatus } : {}),
    ...(logs ? { logs } : {}),
    ...(health !== undefined
      ? {
          health,
          lastHealthcheckAt: health?.checkedAt
            ? new Date(health.checkedAt)
            : now
        }
      : {}),
    ...(metadata ? { metadata } : {}),
    ...(nextStatus === 'running' || nextStatus === 'healthy'
      ? { startedAt: now, stoppedAt: null }
      : {}),
    ...(nextStatus === 'stopped' ||
    nextStatus === 'crashed' ||
    nextStatus === 'timed_out'
      ? { stoppedAt: now }
      : {}),
    updatedAt: now
  }

  if (canUseDatabaseStore()) {
    try {
      const [runtime] = await db
        .update(brokCodeRuntimeSandboxes)
        .set(patch)
        .where(
          and(
            eq(brokCodeRuntimeSandboxes.id, id),
            eq(brokCodeRuntimeSandboxes.workspaceId, workspaceId),
            eq(brokCodeRuntimeSandboxes.userId, userId)
          )
        )
        .returning()

      return runtime ?? null
    } catch (error) {
      console.error(
        'BrokCode runtime DB update failed; using file store:',
        error
      )
    }
  }

  let updatedRuntime: BrokCodeRuntimeSandbox | null = null
  await queueRuntimeStoreWrite(store => ({
    runtimes: store.runtimes.map(runtime => {
      if (
        runtime.id !== id ||
        runtime.workspaceId !== workspaceId ||
        runtime.userId !== userId
      ) {
        return runtime
      }

      updatedRuntime = { ...runtime, ...patch }
      return updatedRuntime
    })
  }))

  return updatedRuntime
}
