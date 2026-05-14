import { after, NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { runSearchPipeline } from '@/lib/brok/search-pipeline'
import {
  appendBackgroundTaskEvent,
  createBackgroundTask,
  updateBackgroundTask
} from '@/lib/tasks/background-tasks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface DeepResearchBody {
  query?: unknown
  recency_days?: unknown
  domains?: unknown
}

function taskTitle(query: string) {
  const trimmed = query.trim().replace(/\s+/g, ' ')
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed
}

async function runDeepResearchTask({
  taskId,
  userId,
  query,
  recencyDays,
  domains
}: {
  taskId: string
  userId: string
  query: string
  recencyDays?: number
  domains?: string[]
}) {
  try {
    await updateBackgroundTask({
      id: taskId,
      userId,
      status: 'running',
      metadata: {
        progress: 10,
        query,
        depth: 'deep',
        recencyDays,
        domains: domains ?? []
      }
    })
    await appendBackgroundTaskEvent({
      id: taskId,
      userId,
      message: 'Planning deep research queries',
      progress: 20
    })

    const result = await runSearchPipeline({
      query,
      depth: 'deep',
      recencyDays,
      domains
    })

    await appendBackgroundTaskEvent({
      id: taskId,
      userId,
      message: 'Synthesizing answer and citations',
      progress: 90
    })

    await updateBackgroundTask({
      id: taskId,
      userId,
      status: 'succeeded',
      metadata: {
        progress: 100,
        query,
        depth: 'deep',
        recencyDays,
        domains: domains ?? [],
        citationCount: result.citations.length,
        searchQueries: result.searchQueryList
      },
      result: {
        answer: result.answer,
        citations: result.citations,
        followUps: result.followUps,
        resolvedQuery: result.resolvedQuery,
        classification: result.classification,
        usage: {
          searchQueries: result.searchQueries,
          tokensUsed: result.tokensUsed
        }
      }
    })
    await appendBackgroundTaskEvent({
      id: taskId,
      userId,
      message: 'Deep research complete',
      progress: 100
    })
  } catch (error) {
    await appendBackgroundTaskEvent({
      id: taskId,
      userId,
      message: 'Deep research failed'
    })
    await updateBackgroundTask({
      id: taskId,
      userId,
      status: 'failed',
      error:
        error instanceof Error
          ? error.message
          : 'Deep research task failed unexpectedly.'
    })
  }
}

function scheduleBackgroundTask(task: Promise<void>) {
  try {
    after(task)
  } catch {
    void task
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request
    .json()
    .catch(() => null)) as DeepResearchBody | null
  const query = typeof body?.query === 'string' ? body.query.trim() : ''
  if (!query) {
    return NextResponse.json(
      { error: 'query must be a non-empty string.' },
      { status: 400 }
    )
  }

  const recencyDays =
    typeof body?.recency_days === 'number' && body.recency_days > 0
      ? Math.floor(body.recency_days)
      : undefined
  const domains = Array.isArray(body?.domains)
    ? body.domains
        .filter((domain): domain is string => typeof domain === 'string')
        .map(domain => domain.trim().replace(/^https?:\/\//, ''))
        .filter(Boolean)
    : undefined

  const task = await createBackgroundTask({
    userId: user.id,
    kind: 'deep-research',
    title: taskTitle(query),
    metadata: {
      progress: 0,
      query,
      depth: 'deep',
      recencyDays,
      domains: domains ?? [],
      events: [
        {
          at: new Date().toISOString(),
          message: 'Queued deep research task',
          progress: 0
        }
      ]
    }
  })

  scheduleBackgroundTask(
    runDeepResearchTask({
      taskId: task.id,
      userId: user.id,
      query,
      recencyDays,
      domains
    })
  )

  return NextResponse.json(
    {
      task,
      statusUrl: `/api/tasks/${task.id}`,
      eventsUrl: `/api/tasks/${task.id}/events`
    },
    { status: 202 }
  )
}
