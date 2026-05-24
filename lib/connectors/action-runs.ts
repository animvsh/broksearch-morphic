import { createHash, randomUUID } from 'crypto'
import { and, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  connectorActionEvents,
  connectorActionRuns,
  connectorApprovalRequests
} from '@/lib/db/schema'
import {
  ConnectorAction,
  getConnectorToolkitDefinition,
  normalizeConnectorToolkit
} from '@/lib/integrations/toolkit-registry'

const APPROVAL_TTL_MS = 10 * 60 * 1000

export type ConnectorActionRunInput = {
  userId: string
  chatId?: string
  toolkit: string
  action: ConnectorAction
  toolSlug?: string
  text?: string
  arguments?: Record<string, unknown>
  connectedAccountId?: string
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

export function hashConnectorActionPayload(payload: Record<string, unknown>) {
  return createHash('sha256').update(stableStringify(payload)).digest('hex')
}

export function isMutatingConnectorAction(
  toolkit: string,
  action: ConnectorAction
) {
  if (action === 'connect' || action === 'read') return false
  const definition = getConnectorToolkitDefinition(toolkit)
  return definition?.mutatingActions.includes(action) ?? true
}

function createApprovalId(payloadHash: string) {
  return `approval_${payloadHash.slice(0, 24)}_${randomUUID().slice(0, 8)}`
}

export async function createConnectorActionRun(input: ConnectorActionRunInput) {
  const toolkit = normalizeConnectorToolkit(input.toolkit)
  const payload = {
    toolkit,
    action: input.action,
    toolSlug: input.toolSlug,
    text: input.text,
    arguments: input.arguments,
    connectedAccountId: input.connectedAccountId
  }
  const payloadHash = hashConnectorActionPayload(payload)
  const requiresApproval = isMutatingConnectorAction(toolkit, input.action)
  const approvalId = requiresApproval ? createApprovalId(payloadHash) : null
  const now = new Date()
  const expiresAt = new Date(now.getTime() + APPROVAL_TTL_MS)

  const [run] = await db
    .insert(connectorActionRuns)
    .values({
      userId: input.userId,
      chatId: input.chatId,
      toolkit,
      action: input.action,
      toolSlug: input.toolSlug,
      status: requiresApproval ? 'pending_approval' : 'approved',
      requiresApproval,
      approvalId,
      payloadHash,
      payload
    })
    .returning()

  if (!run) {
    throw new Error('Could not create connector action run.')
  }

  if (requiresApproval && approvalId) {
    await db.insert(connectorApprovalRequests).values({
      id: approvalId,
      runId: run.id,
      userId: input.userId,
      payloadHash,
      expiresAt
    })
  }

  await recordConnectorActionEvent({
    runId: run.id,
    userId: input.userId,
    eventType: requiresApproval ? 'approval_requested' : 'approved',
    message: requiresApproval
      ? 'Connector action is waiting for user approval.'
      : 'Read-only connector action is approved.',
    metadata: { toolkit, action: input.action }
  })

  return {
    run,
    approval: approvalId
      ? {
          id: approvalId,
          expiresAt: expiresAt.toISOString(),
          payloadHash
        }
      : null
  }
}

export async function recordConnectorActionEvent({
  runId,
  userId,
  eventType,
  message,
  metadata
}: {
  runId: string
  userId: string
  eventType: string
  message?: string
  metadata?: Record<string, unknown>
}) {
  await db.insert(connectorActionEvents).values({
    runId,
    userId,
    eventType,
    message,
    metadata
  })
}

export async function approveConnectorActionRun({
  runId,
  userId
}: {
  runId: string
  userId: string
}) {
  const [run] = await db
    .select()
    .from(connectorActionRuns)
    .where(
      and(
        eq(connectorActionRuns.id, runId),
        eq(connectorActionRuns.userId, userId)
      )
    )
    .limit(1)

  if (!run) {
    throw new Error('Connector action run was not found.')
  }

  if (!run.requiresApproval) {
    return run
  }

  if (!run.approvalId) {
    throw new Error('Connector action is missing an approval request.')
  }

  const [approval] = await db
    .select()
    .from(connectorApprovalRequests)
    .where(
      and(
        eq(connectorApprovalRequests.id, run.approvalId),
        eq(connectorApprovalRequests.userId, userId)
      )
    )
    .limit(1)

  if (!approval) {
    throw new Error('Connector approval request was not found.')
  }

  if (approval.status !== 'pending') {
    throw new Error('Connector approval was already used or closed.')
  }

  if (approval.expiresAt.getTime() < Date.now()) {
    await db
      .update(connectorApprovalRequests)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(connectorApprovalRequests.id, approval.id))
    throw new Error('Connector approval expired. Prepare the action again.')
  }

  const now = new Date()
  const [approvedRun] = await db
    .update(connectorActionRuns)
    .set({
      status: 'approved',
      approvedAt: now,
      updatedAt: now
    })
    .where(
      and(
        eq(connectorActionRuns.id, runId),
        eq(connectorActionRuns.userId, userId)
      )
    )
    .returning()

  await db
    .update(connectorApprovalRequests)
    .set({
      status: 'approved',
      approvedAt: now,
      updatedAt: now
    })
    .where(eq(connectorApprovalRequests.id, approval.id))

  await recordConnectorActionEvent({
    runId,
    userId,
    eventType: 'approved',
    message: 'User approved connector action.'
  })

  return approvedRun || run
}

export async function getConnectorActionRun({
  runId,
  userId
}: {
  runId: string
  userId: string
}) {
  const [run] = await db
    .select()
    .from(connectorActionRuns)
    .where(
      and(
        eq(connectorActionRuns.id, runId),
        eq(connectorActionRuns.userId, userId)
      )
    )
    .limit(1)

  return run || null
}

export async function markConnectorActionRunRunning({
  runId,
  userId
}: {
  runId: string
  userId: string
}) {
  const now = new Date()
  const [run] = await db
    .update(connectorActionRuns)
    .set({
      status: 'running',
      startedAt: now,
      updatedAt: now
    })
    .where(
      and(
        eq(connectorActionRuns.id, runId),
        eq(connectorActionRuns.userId, userId)
      )
    )
    .returning()

  await recordConnectorActionEvent({
    runId,
    userId,
    eventType: 'running',
    message: 'Connector action execution started.'
  })

  return run
}

export async function markConnectorActionRunSucceeded({
  runId,
  userId,
  result
}: {
  runId: string
  userId: string
  result: Record<string, unknown>
}) {
  const now = new Date()
  const [run] = await db
    .update(connectorActionRuns)
    .set({
      status: 'succeeded',
      result,
      completedAt: now,
      updatedAt: now
    })
    .where(
      and(
        eq(connectorActionRuns.id, runId),
        eq(connectorActionRuns.userId, userId)
      )
    )
    .returning()

  await recordConnectorActionEvent({
    runId,
    userId,
    eventType: 'succeeded',
    message: 'Connector action completed.',
    metadata: result
  })

  return run
}

export async function markConnectorActionRunFailed({
  runId,
  userId,
  error
}: {
  runId: string
  userId: string
  error: string
}) {
  const now = new Date()
  const [run] = await db
    .update(connectorActionRuns)
    .set({
      status: 'failed',
      error,
      completedAt: now,
      updatedAt: now
    })
    .where(
      and(
        eq(connectorActionRuns.id, runId),
        eq(connectorActionRuns.userId, userId)
      )
    )
    .returning()

  await recordConnectorActionEvent({
    runId,
    userId,
    eventType: 'failed',
    message: error
  })

  return run
}

export async function consumeConnectorApproval({
  approvalId,
  userId
}: {
  approvalId: string
  userId: string
}) {
  const now = new Date()
  const [approval] = await db
    .update(connectorApprovalRequests)
    .set({
      status: 'consumed',
      consumedAt: now,
      updatedAt: now
    })
    .where(
      and(
        eq(connectorApprovalRequests.id, approvalId),
        eq(connectorApprovalRequests.userId, userId),
        eq(connectorApprovalRequests.status, 'approved')
      )
    )
    .returning()

  return Boolean(approval)
}
