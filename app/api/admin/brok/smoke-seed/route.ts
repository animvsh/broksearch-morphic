import { NextRequest, NextResponse } from 'next/server'

import { eq } from 'drizzle-orm'
import { randomUUID, timingSafeEqual } from 'node:crypto'

import { ensureWorkspaceForUser } from '@/lib/actions/api-keys'
import { generateApiKey, getKeyPrefix, hashApiKey } from '@/lib/api-key'
import { db } from '@/lib/db'
import {
  createOrUpdateOutline,
  createPresentation,
  createSlides,
  setPresentationShare
} from '@/lib/db/actions/presentations'
import { apiKeys, usageEvents } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SeedKind = 'smoke' | 'stress'

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

  const presentation = await createPresentation({
    title: 'Stress Test Deck',
    userId,
    description: 'Stress verification deck',
    language: 'en',
    style: 'professional',
    slideCount: 2,
    themeId: 'minimal_light'
  })
  await createOrUpdateOutline({
    presentationId: presentation.id,
    outlineJson: [
      { title: 'Intro', bullets: ['Point A', 'Point B'] },
      { title: 'Next Steps', bullets: ['Point C', 'Point D'] }
    ],
    status: 'ready'
  })
  const slides = await createSlides({
    presentationId: presentation.id,
    slides: [
      {
        slideIndex: 0,
        title: 'Intro',
        layoutType: 'title',
        contentJson: {
          bullets: ['Point A', 'Point B'],
          subtitle: 'Smoke verification'
        }
      },
      {
        slideIndex: 1,
        title: 'Next Steps',
        layoutType: 'text',
        contentJson: {
          bullets: ['Point C', 'Point D']
        }
      }
    ]
  })
  const share = await setPresentationShare(presentation.id, userId, true)

  return {
    kind: 'stress' as const,
    workspaceId: workspace.id,
    mainKey: mainKey.key,
    lowRpmKey: lowRpmKey.key,
    dailyLimitedKey: dailyLimitedKey.key,
    pausedKey: pausedKey.key,
    revokedKey: revokedKey.key,
    presentationId: presentation.id,
    slideIds: slides.map(slide => slide.id),
    shareId: share?.shareId ?? `seed_${randomUUID()}`
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

  return NextResponse.json(
    { error: 'kind must be smoke or stress' },
    { status: 400 }
  )
}
