import { NextRequest, NextResponse } from 'next/server'

import { and, eq } from 'drizzle-orm'
import { timingSafeEqual } from 'node:crypto'

import { ensureWorkspaceForUser } from '@/lib/actions/api-keys'
import { generateApiKey, getKeyPrefix, hashApiKey } from '@/lib/api-key'
import { db } from '@/lib/db'
import {
  apiKeys,
  chats,
  generateId,
  messages,
  parts,
  usageEvents
} from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SeedKind = 'smoke' | 'stress' | 'share' | 'share-cleanup'

function isAuthorized(request: NextRequest) {
  const token = process.env.SMOKE_SEED_TOKEN
  if (!token) return false

  const authorization = request.headers.get('authorization') || ''
  const provided = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || ''
  const expectedBuffer = Buffer.from(token)
  const providedBuffer = Buffer.from(provided)

  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  )
}

async function createKey(
  workspaceId: string,
  userId: string,
  input: {
    name: string
    environment: 'test' | 'live'
    scopes: string[]
    allowedModels: string[]
    rpmLimit: number
    dailyRequestLimit: number
    monthlyBudgetCents: number
  }
) {
  const rawKey = generateApiKey(input.environment)
  const [created] = await db
    .insert(apiKeys)
    .values({
      workspaceId,
      userId,
      name: input.name,
      keyPrefix: getKeyPrefix(rawKey),
      keyHash: hashApiKey(rawKey),
      environment: input.environment,
      scopes: input.scopes,
      allowedModels: input.allowedModels,
      rpmLimit: input.rpmLimit,
      dailyRequestLimit: input.dailyRequestLimit,
      monthlyBudgetCents: input.monthlyBudgetCents
    })
    .returning()

  return { ...created, key: rawKey }
}

async function seedSmoke(userId: string) {
  const workspace = await ensureWorkspaceForUser(userId)
  const key = await createKey(workspace.id, userId, {
    name: 'Smoke Test Key',
    environment: 'test',
    scopes: ['chat:write', 'search:write', 'usage:read'],
    allowedModels: [],
    rpmLimit: 60,
    dailyRequestLimit: 5000,
    monthlyBudgetCents: 0
  })

  return {
    kind: 'smoke' as const,
    workspaceId: workspace.id,
    apiKey: key.key
  }
}

async function seedStress(userId: string) {
  const workspace = await ensureWorkspaceForUser(userId)

  const mainKey = await createKey(workspace.id, userId, {
    name: 'Stress Main Key',
    environment: 'test',
    scopes: ['chat:write', 'search:write', 'code:write', 'usage:read'],
    allowedModels: [],
    rpmLimit: 5,
    dailyRequestLimit: 5000,
    monthlyBudgetCents: 0
  })

  const lowRpmKey = await createKey(workspace.id, userId, {
    name: 'Stress Low RPM Key',
    environment: 'test',
    scopes: ['chat:write', 'usage:read'],
    allowedModels: ['brok-lite'],
    rpmLimit: 1,
    dailyRequestLimit: 5000,
    monthlyBudgetCents: 0
  })

  const dailyLimitedKey = await createKey(workspace.id, userId, {
    name: 'Stress Daily Limited Key',
    environment: 'test',
    scopes: ['chat:write'],
    allowedModels: ['brok-lite'],
    rpmLimit: 5,
    dailyRequestLimit: 1,
    monthlyBudgetCents: 0
  })
  await db.insert(usageEvents).values({
    requestId: `stress_daily_${Date.now()}`,
    workspaceId: workspace.id,
    userId,
    apiKeyId: dailyLimitedKey.id,
    endpoint: 'chat',
    model: 'brok-lite',
    provider: 'Brok',
    inputTokens: 1,
    outputTokens: 1,
    providerCostUsd: '0',
    billedUsd: '0',
    latencyMs: 1,
    status: 'success'
  })

  const pausedKey = await createKey(workspace.id, userId, {
    name: 'Stress Paused Key',
    environment: 'test',
    scopes: ['chat:write'],
    allowedModels: ['brok-lite'],
    rpmLimit: 5,
    dailyRequestLimit: 5000,
    monthlyBudgetCents: 0
  })
  await db
    .update(apiKeys)
    .set({ status: 'paused' })
    .where(eq(apiKeys.id, pausedKey.id))

  const revokedKey = await createKey(workspace.id, userId, {
    name: 'Stress Revoked Key',
    environment: 'test',
    scopes: ['chat:write'],
    allowedModels: ['brok-lite'],
    rpmLimit: 5,
    dailyRequestLimit: 5000,
    monthlyBudgetCents: 0
  })
  await db
    .update(apiKeys)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(eq(apiKeys.id, revokedKey.id))

  return {
    kind: 'stress' as const,
    workspaceId: workspace.id,
    mainKey: mainKey.key,
    lowRpmKey: lowRpmKey.key,
    dailyLimitedKey: dailyLimitedKey.key,
    pausedKey: pausedKey.key,
    revokedKey: revokedKey.key
  }
}

async function seedShare(
  userId: string,
  input: {
    title?: string
    userText?: string
    assistantText?: string
  }
) {
  const chatId = generateId()
  const userMessageId = generateId()
  const assistantMessageId = generateId()
  const title = input.title?.trim() || 'Share smoke public thread'
  const userText = input.userText?.trim() || 'Share smoke user prompt'
  const assistantText =
    input.assistantText?.trim() ||
    'Share smoke answer visible to signed-out visitors'

  await db.transaction(async tx => {
    await tx.insert(chats).values({
      id: chatId,
      title,
      userId,
      visibility: 'public'
    })
    await tx.insert(messages).values([
      {
        id: userMessageId,
        chatId,
        role: 'user'
      },
      {
        id: assistantMessageId,
        chatId,
        role: 'assistant'
      }
    ])
    await tx.insert(parts).values([
      {
        id: generateId(),
        messageId: userMessageId,
        order: 0,
        type: 'text',
        text_text: userText
      },
      {
        id: generateId(),
        messageId: assistantMessageId,
        order: 0,
        type: 'text',
        text_text: assistantText
      }
    ])
  })

  return {
    kind: 'share' as const,
    chatId,
    title,
    userText,
    assistantText
  }
}

async function cleanupShare(userId: string, chatId: string) {
  const deleted = await db
    .delete(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
    .returning({ id: chats.id })

  return {
    kind: 'share-cleanup' as const,
    chatId,
    deleted: deleted.length
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.SMOKE_SEED_TOKEN) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const kind = body?.kind as SeedKind | undefined
  const userId =
    typeof body?.userId === 'string' && body.userId.trim()
      ? body.userId.trim()
      : kind === 'stress'
        ? '00000000-0000-0000-0000-000000000000'
        : 'anonymous-user'

  if (kind === 'smoke') {
    return NextResponse.json(await seedSmoke(userId), {
      headers: { 'Cache-Control': 'no-store' }
    })
  }

  if (kind === 'stress') {
    return NextResponse.json(await seedStress(userId), {
      headers: { 'Cache-Control': 'no-store' }
    })
  }

  if (kind === 'share') {
    return NextResponse.json(await seedShare(userId, body || {}), {
      headers: { 'Cache-Control': 'no-store' }
    })
  }

  if (kind === 'share-cleanup') {
    if (typeof body?.chatId !== 'string' || !body.chatId.trim()) {
      return NextResponse.json(
        { error: 'chatId is required for share-cleanup' },
        { status: 400 }
      )
    }

    return NextResponse.json(await cleanupShare(userId, body.chatId.trim()), {
      headers: { 'Cache-Control': 'no-store' }
    })
  }

  return NextResponse.json(
    { error: 'kind must be smoke, stress, share, or share-cleanup' },
    { status: 400 }
  )
}
