import { NextRequest, NextResponse } from 'next/server'

import { createHash } from 'crypto'
import { and, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { brokIdempotencyKeys } from '@/lib/db/schema-brok'

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

type IdempotencyStatus = 'processing' | 'completed' | 'failed'

type IdempotencyReplay = {
  kind: 'replay'
  response: NextResponse
}

type IdempotencyBlocked = {
  kind: 'blocked'
  response: NextResponse
}

type IdempotencyReserved = {
  kind: 'reserved'
  key: string
  route: string
  requestHash: string
  workspaceId: string
  apiKeyId: string
}

export type IdempotencyResult =
  | { kind: 'none' }
  | IdempotencyReplay
  | IdempotencyBlocked
  | IdempotencyReserved

export type IdempotencyCompletion = IdempotencyReserved

export function idempotencyHeaders({
  key,
  replayed = false
}: {
  key?: string
  replayed?: boolean
}): Record<string, string> {
  if (!key) return {}
  return {
    'Idempotency-Key': key,
    'Idempotency-Replayed': replayed ? 'true' : 'false'
  }
}

export async function beginIdempotentRequest({
  request,
  workspaceId,
  apiKeyId,
  route,
  body,
  stream
}: {
  request: NextRequest
  workspaceId: string
  apiKeyId: string
  route: string
  body: unknown
  stream: boolean
}): Promise<IdempotencyResult> {
  const key = request.headers.get('Idempotency-Key')
  if (key === null) {
    return { kind: 'none' }
  }

  if (key.trim().length === 0 || key.length > 255) {
    return {
      kind: 'blocked',
      response: idempotencyErrorResponse({
        status: 400,
        code: 'invalid_idempotency_key',
        message: 'Idempotency-Key must be between 1 and 255 characters.'
      })
    }
  }

  const requestHash = hashIdempotencyRequest({ route, body, stream })
  const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS)

  try {
    const inserted = await db
      .insert(brokIdempotencyKeys)
      .values({
        workspaceId,
        apiKeyId,
        key,
        route,
        requestHash,
        status: 'processing',
        expiresAt
      })
      .onConflictDoNothing()
      .returning({ id: brokIdempotencyKeys.id })

    if (inserted.length > 0) {
      return {
        kind: 'reserved',
        key,
        route,
        requestHash,
        workspaceId,
        apiKeyId
      }
    }

    const [existing] = await db
      .select()
      .from(brokIdempotencyKeys)
      .where(
        and(
          eq(brokIdempotencyKeys.workspaceId, workspaceId),
          eq(brokIdempotencyKeys.apiKeyId, apiKeyId),
          eq(brokIdempotencyKeys.route, route),
          eq(brokIdempotencyKeys.key, key)
        )
      )
      .limit(1)

    if (!existing) {
      return {
        kind: 'reserved',
        key,
        route,
        requestHash,
        workspaceId,
        apiKeyId
      }
    }

    if (existing.requestHash !== requestHash) {
      return {
        kind: 'blocked',
        response: idempotencyErrorResponse({
          status: 409,
          code: 'idempotency_key_conflict',
          message:
            'Idempotency-Key was already used with a different request payload.',
          key
        })
      }
    }

    if (existing.status === 'completed') {
      if (stream) {
        return {
          kind: 'blocked',
          response: idempotencyErrorResponse({
            status: 409,
            code: 'idempotency_stream_replay_unsupported',
            message:
              'Streaming responses cannot be replayed. Use a new Idempotency-Key for another streaming attempt.',
            key
          })
        }
      }

      if (existing.responseStatus && existing.responseBody) {
        return {
          kind: 'replay',
          response: NextResponse.json(existing.responseBody, {
            status: existing.responseStatus,
            headers: {
              ...(existing.responseHeaders ?? {}),
              ...idempotencyHeaders({ key, replayed: true })
            }
          })
        }
      }
    }

    const code =
      existing.status === 'failed'
        ? 'idempotency_previous_request_failed'
        : 'idempotency_request_in_progress'

    return {
      kind: 'blocked',
      response: idempotencyErrorResponse({
        status: 409,
        code,
        message:
          existing.status === 'failed'
            ? 'The previous request for this Idempotency-Key failed before a replayable response was stored.'
            : 'A request with this Idempotency-Key is already in progress.',
        key
      })
    }
  } catch (error) {
    console.error('[idempotency] Failed to reserve idempotency key:', error)
    if (process.env.BROK_CLOUD_DEPLOYMENT === 'true') {
      return {
        kind: 'blocked',
        response: idempotencyStorageUnavailableResponse()
      }
    }
    return { kind: 'none' }
  }
}

export async function completeIdempotentRequest({
  idempotency,
  requestId,
  status,
  responseStatus,
  responseBody,
  responseHeaders
}: {
  idempotency: IdempotencyResult
  requestId: string
  status?: IdempotencyStatus
  responseStatus?: number
  responseBody?: Record<string, unknown>
  responseHeaders?: Record<string, string>
}) {
  if (idempotency.kind !== 'reserved') return

  try {
    await db
      .update(brokIdempotencyKeys)
      .set({
        status: status ?? (responseBody ? 'completed' : 'failed'),
        requestId,
        responseStatus,
        responseBody,
        responseHeaders,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(brokIdempotencyKeys.route, idempotency.route),
          eq(brokIdempotencyKeys.key, idempotency.key),
          eq(brokIdempotencyKeys.requestHash, idempotency.requestHash),
          eq(brokIdempotencyKeys.workspaceId, idempotency.workspaceId),
          eq(brokIdempotencyKeys.apiKeyId, idempotency.apiKeyId)
        )
      )
  } catch (error) {
    console.error('[idempotency] Failed to complete idempotency key:', error)
    if (process.env.BROK_CLOUD_DEPLOYMENT === 'true') {
      throw error
    }
  }
}

export function hashIdempotencyRequest({
  route,
  body,
  stream
}: {
  route: string
  body: unknown
  stream: boolean
}) {
  return createHash('sha256')
    .update(stableJsonStringify({ route, stream, body }))
    .digest('hex')
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(normalizeForStableJson(value))
}

function normalizeForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item =>
      item === undefined ? null : normalizeForStableJson(item)
    )
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, normalizeForStableJson(entryValue)])
  )
}

function idempotencyErrorResponse({
  status,
  code,
  message,
  key
}: {
  status: number
  code: string
  message: string
  key?: string
}) {
  return NextResponse.json(
    {
      error: {
        type: status === 400 ? 'invalid_request_error' : 'conflict_error',
        code,
        message
      }
    },
    {
      status,
      headers: idempotencyHeaders({ key })
    }
  )
}

function idempotencyStorageUnavailableResponse() {
  return NextResponse.json(
    {
      error: {
        type: 'service_unavailable',
        code: 'idempotency_storage_unavailable',
        message:
          'Idempotency storage is temporarily unavailable. Please retry shortly.'
      }
    },
    { status: 503 }
  )
}
