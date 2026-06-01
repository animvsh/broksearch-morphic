import {
  advanceBrokCodeRunLifecycle,
  createBrokCodeRunLifecycle
} from '@/lib/brokcode/run-lifecycle'
import {
  appendBackgroundTaskEvent,
  updateBackgroundTask
} from '@/lib/tasks/background-tasks'

export type BrokCodeDurableTask = {
  id: string
  kind: string
  status: string
  userId: string
  metadata?: Record<string, any> | null
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
}

export const BROKCODE_JOB_STALE_MS = Number(
  process.env.BROKCODE_JOB_STALE_MS ?? 12 * 60 * 1000
)

const ACTIVE_BROKCODE_TASK_STATUSES = new Set(['queued', 'running'])

function nowIso(now = new Date()) {
  return now.toISOString()
}

function asTime(value: unknown) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime()
  }
  return null
}

function workerHeartbeatTime(metadata: Record<string, any> | null | undefined) {
  const worker = metadata?.worker
  if (!worker || typeof worker !== 'object') return null
  return asTime((worker as Record<string, unknown>).heartbeatAt)
}

function latestTime(...values: Array<number | null>) {
  const times = values.filter(
    (value): value is number => typeof value === 'number'
  )
  if (times.length === 0) return null
  return Math.max(...times)
}

export function getBrokCodeJobRegistry() {
  const globalState = globalThis as typeof globalThis & {
    __brokCodeJobWorkers?: Set<string>
  }
  if (!globalState.__brokCodeJobWorkers) {
    globalState.__brokCodeJobWorkers = new Set()
  }
  return globalState.__brokCodeJobWorkers
}

export function getActiveBrokCodeJobIds() {
  return new Set(getBrokCodeJobRegistry())
}

export function createBrokCodeWorkerMetadata({
  taskId,
  leaseId,
  now = new Date()
}: {
  taskId: string
  leaseId: string
  now?: Date
}) {
  return {
    worker: {
      taskId,
      leaseId,
      heartbeatAt: nowIso(now),
      staleAfterMs: BROKCODE_JOB_STALE_MS
    }
  }
}

export function isStaleBrokCodeTask({
  task,
  activeTaskIds = getActiveBrokCodeJobIds(),
  now = new Date()
}: {
  task: BrokCodeDurableTask
  activeTaskIds?: Set<string>
  now?: Date
}) {
  if (task.kind !== 'brokcode') return false
  if (!ACTIVE_BROKCODE_TASK_STATUSES.has(task.status)) return false
  if (activeTaskIds.has(task.id)) return false

  const lastSeen = latestTime(
    workerHeartbeatTime(task.metadata),
    asTime(task.updatedAt),
    asTime(task.createdAt)
  )
  if (!lastSeen) return false

  return now.getTime() - lastSeen > BROKCODE_JOB_STALE_MS
}

export function buildStaleBrokCodeLifecycle(current?: unknown) {
  return advanceBrokCodeRunLifecycle({
    current: current ?? createBrokCodeRunLifecycle(),
    event: 'error',
    payload: {
      message:
        'BrokCode job stopped without an active worker. Retry this run from task history.'
    }
  })
}

export async function reconcileStaleBrokCodeTask({
  task,
  activeTaskIds = getActiveBrokCodeJobIds(),
  now = new Date()
}: {
  task: BrokCodeDurableTask
  activeTaskIds?: Set<string>
  now?: Date
}) {
  if (!isStaleBrokCodeTask({ task, activeTaskIds, now })) return task

  const lifecycle = buildStaleBrokCodeLifecycle(task.metadata?.lifecycle)
  const message =
    'BrokCode job stopped without an active worker. Retry this run from task history.'
  const staleJob = {
    detectedAt: nowIso(now),
    staleAfterMs: BROKCODE_JOB_STALE_MS
  }

  await appendBackgroundTaskEvent({
    id: task.id,
    userId: task.userId,
    message,
    progress: 100,
    metadata: {
      phase: 'stalled',
      progress: 100,
      lifecycle: lifecycle.steps,
      retryable: true,
      staleJob
    }
  }).catch(error => {
    console.error('Failed to append stale BrokCode job event:', error)
  })

  const updated = await updateBackgroundTask({
    id: task.id,
    userId: task.userId,
    status: 'failed',
    error: message,
    metadata: {
      phase: 'stalled',
      progress: 100,
      lifecycle: lifecycle.steps,
      retryable: true,
      staleJob
    }
  }).catch(error => {
    console.error('Failed to mark stale BrokCode job failed:', error)
    return null
  })

  return updated ?? task
}
