'use server'

import { revalidatePath } from 'next/cache'

import { getCurrentAppAccess, hasFeatureAccess } from '@/lib/auth/app-access'
import { isAnonymousAuthMode } from '@/lib/auth/get-current-user'
import {
  type ApiKeyAuditRequestContext,
  recordApiKeyAuditEvent,
  recordApiKeyAuditEvents
} from '@/lib/brok/api-key-audit'
import type { CreateApiKeyInput } from '@/lib/brok/api-platform'
import {
  validateApiKeyStatusTransition,
  validateCreateApiKeyInput
} from '@/lib/brok/api-platform'
import type { apiKeys, workspaces } from '@/lib/db/schema'

function canUseLocalApiPlatformFallback() {
  if (process.env.BROK_CLOUD_DEPLOYMENT === 'true') return false
  if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID) {
    return false
  }
  return isAnonymousAuthMode()
}

function localWorkspaceForUser(userId: string) {
  return {
    id: '00000000-0000-0000-0000-000000000010',
    name: 'Local API Workspace',
    ownerUserId: userId,
    plan: 'free',
    status: 'active',
    monthlyBudgetCents: 0,
    createdAt: new Date(0)
  } satisfies typeof workspaces.$inferSelect
}

async function getApiKeyDependencies() {
  const [
    { asc, desc, eq },
    { db },
    { apiKeys, apiKeyAuditEvents, workspaces }
  ] = await Promise.all([
    import('drizzle-orm'),
    import('@/lib/db'),
    import('@/lib/db/schema')
  ])

  return { asc, desc, eq, db, apiKeys, apiKeyAuditEvents, workspaces }
}

async function getApiKeyCrypto() {
  const { generateApiKey, getKeyPrefix, hashNewApiKey, maskApiKey } =
    await import('@/lib/api-key')

  return { generateApiKey, getKeyPrefix, hashNewApiKey, maskApiKey }
}

function revalidateApiKeyPages() {
  revalidatePath('/api-keys')
  revalidatePath('/api-platform/audit')
  revalidatePath('/api-platform/keys')
}

async function getApiKeyAuditRequestContext(): Promise<ApiKeyAuditRequestContext> {
  try {
    const { headers } = await import('next/headers')
    const headerList = await headers()
    const forwardedFor = headerList.get('x-forwarded-for')
    const ipAddress =
      forwardedFor?.split(',')[0]?.trim() ||
      headerList.get('x-real-ip') ||
      headerList.get('cf-connecting-ip')

    return {
      requestId:
        headerList.get('x-request-id') || headerList.get('x-vercel-id') || null,
      ipAddress,
      userAgent: headerList.get('user-agent')
    }
  } catch {
    return {}
  }
}

export async function ensureWorkspaceForUser(userId: string) {
  try {
    const { asc, eq, db, workspaces } = await getApiKeyDependencies()
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerUserId, userId))
      .orderBy(asc(workspaces.createdAt))
      .limit(1)

    if (workspace) {
      return workspace
    }

    const [createdWorkspace] = await db
      .insert(workspaces)
      .values({
        name: 'Personal Workspace',
        ownerUserId: userId
      })
      .returning()

    return createdWorkspace
  } catch (error) {
    if (canUseLocalApiPlatformFallback()) {
      console.error(
        'API platform workspace lookup failed; using local workspace:',
        error
      )
      return localWorkspaceForUser(userId)
    }

    throw error
  }
}

async function requireApiPlatformUser() {
  const access = await getCurrentAppAccess()

  if (!access.user) {
    throw new Error('Sign in to your Brok account before managing API keys.')
  }

  if (!hasFeatureAccess(access, 'api_platform')) {
    throw new Error('Your account does not have Brok API Platform access.')
  }

  return access.user
}

export async function createApiKey(
  userId: string,
  workspaceId: string,
  input: CreateApiKeyInput
) {
  const user = await requireApiPlatformUser()
  if (!user || user.id !== userId) {
    throw new Error('Sign in to your Brok account before creating API keys.')
  }
  const validatedInput = validateCreateApiKeyInput(input)
  const { eq, db, apiKeys, workspaces } = await getApiKeyDependencies()
  const { generateApiKey, getKeyPrefix, hashNewApiKey, maskApiKey } =
    await getApiKeyCrypto()

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)

  if (!workspace || workspace.ownerUserId !== user.id) {
    throw new Error('This workspace does not belong to your Brok account.')
  }

  const rawKey = generateApiKey(validatedInput.environment)
  const { hash: keyHash, salt: keySalt } = hashNewApiKey(rawKey)
  const keyPrefix = getKeyPrefix(rawKey)
  const requestContext = await getApiKeyAuditRequestContext()

  const [newKey] = await db
    .insert(apiKeys)
    .values({
      workspaceId,
      userId,
      name: validatedInput.name,
      keyPrefix,
      keyHash,
      keySalt,
      environment: validatedInput.environment,
      scopes: validatedInput.scopes,
      allowedModels: validatedInput.allowedModels,
      rpmLimit: validatedInput.rpmLimit,
      dailyRequestLimit: validatedInput.dailyRequestLimit,
      monthlyBudgetCents: validatedInput.monthlyBudgetCents,
      expiresAt: validatedInput.expiresAt
    })
    .returning()

  await recordApiKeyAuditEvents([
    {
      workspaceId,
      apiKeyId: newKey.id,
      actorUserId: user.id,
      actorType: 'user',
      eventType: 'created',
      keyPrefix: newKey.keyPrefix,
      ...requestContext,
      metadata: {
        name: newKey.name,
        environment: newKey.environment,
        scopes: newKey.scopes,
        allowedModels: newKey.allowedModels,
        rpmLimit: newKey.rpmLimit,
        dailyRequestLimit: newKey.dailyRequestLimit,
        monthlyBudgetCents: newKey.monthlyBudgetCents
      }
    },
    {
      workspaceId,
      apiKeyId: newKey.id,
      actorUserId: user.id,
      actorType: 'user',
      eventType: 'secret_revealed_once',
      keyPrefix: newKey.keyPrefix,
      ...requestContext,
      metadata: {
        delivery: 'create_response',
        rawValuePersisted: false
      }
    }
  ])

  return {
    id: newKey.id,
    name: newKey.name,
    key: rawKey, // Only returned once!
    maskedKey: maskApiKey(rawKey),
    keyPrefix: newKey.keyPrefix,
    environment: newKey.environment,
    scopes: newKey.scopes,
    allowedModels: newKey.allowedModels,
    rpmLimit: newKey.rpmLimit,
    dailyRequestLimit: newKey.dailyRequestLimit,
    monthlyBudgetCents: newKey.monthlyBudgetCents,
    expiresAt: newKey.expiresAt,
    createdAt: newKey.createdAt
  }
}

export async function listApiKeys(workspaceId: string) {
  const user = await requireApiPlatformUser()
  const { eq, db, apiKeys, workspaces } = await getApiKeyDependencies()
  const { maskApiKey } = await getApiKeyCrypto()

  let keys: Array<typeof apiKeys.$inferSelect>

  try {
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1)

    if (!workspace || workspace.ownerUserId !== user.id) {
      throw new Error('This workspace does not belong to your Brok account.')
    }

    keys = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.workspaceId, workspaceId))
  } catch (error) {
    if (canUseLocalApiPlatformFallback()) {
      console.error('API key lookup failed; using empty local list:', error)
      keys = []
    } else {
      throw error
    }
  }

  return keys.map(key => ({
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    maskedKey: maskApiKey(key.keyPrefix + 'xxxxxxxx'),
    environment: key.environment,
    status: key.status,
    scopes: (key.scopes || []) as string[],
    allowedModels: (key.allowedModels || []) as string[],
    rpmLimit: key.rpmLimit,
    dailyRequestLimit: key.dailyRequestLimit,
    monthlyBudgetCents: key.monthlyBudgetCents,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    createdAt: key.createdAt,
    revokedAt: key.revokedAt
  }))
}

export async function listApiKeyAuditEvents(workspaceId: string, limit = 100) {
  const user = await requireApiPlatformUser()
  const { desc, eq, db, apiKeyAuditEvents, workspaces } =
    await getApiKeyDependencies()

  try {
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1)

    if (!workspace || workspace.ownerUserId !== user.id) {
      throw new Error('This workspace does not belong to your Brok account.')
    }

    const events = await db
      .select()
      .from(apiKeyAuditEvents)
      .where(eq(apiKeyAuditEvents.workspaceId, workspaceId))
      .orderBy(desc(apiKeyAuditEvents.createdAt))
      .limit(Math.min(Math.max(limit, 1), 200))

    return events.map(event => ({
      id: event.id,
      apiKeyId: event.apiKeyId,
      actorUserId: event.actorUserId,
      actorType: event.actorType,
      eventType: event.eventType,
      keyPrefix: event.keyPrefix,
      requestId: event.requestId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      metadata: event.metadata,
      createdAt: event.createdAt
    }))
  } catch (error) {
    if (canUseLocalApiPlatformFallback()) {
      console.error('API key audit lookup failed; using empty list:', error)
      return []
    }

    throw error
  }
}

async function requireOwnedApiKey(keyId: string) {
  const user = await requireApiPlatformUser()
  const { eq, db, apiKeys, workspaces } = await getApiKeyDependencies()

  const [key] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.id, keyId))
    .limit(1)

  if (!key || key.userId !== user.id) {
    throw new Error('This API key does not belong to your Brok account.')
  }

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, key.workspaceId))
    .limit(1)

  if (!workspace || workspace.ownerUserId !== user.id) {
    throw new Error(
      'This API key workspace does not belong to your Brok account.'
    )
  }

  return key
}

export async function revokeApiKey(keyId: string) {
  const key = await requireOwnedApiKey(keyId)
  validateApiKeyStatusTransition(key.status, 'revoke')
  const { eq, db, apiKeys } = await getApiKeyDependencies()
  const requestContext = await getApiKeyAuditRequestContext()

  await db
    .update(apiKeys)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(eq(apiKeys.id, keyId))

  await recordApiKeyAuditEvent({
    workspaceId: key.workspaceId,
    apiKeyId: key.id,
    actorUserId: key.userId,
    actorType: 'user',
    eventType: 'revoked',
    keyPrefix: key.keyPrefix,
    ...requestContext,
    metadata: {
      previousStatus: key.status,
      newStatus: 'revoked'
    }
  })

  revalidateApiKeyPages()
}

export async function pauseApiKey(keyId: string) {
  const key = await requireOwnedApiKey(keyId)
  validateApiKeyStatusTransition(key.status, 'pause')
  const { eq, db, apiKeys } = await getApiKeyDependencies()
  const requestContext = await getApiKeyAuditRequestContext()

  await db
    .update(apiKeys)
    .set({ status: 'paused' })
    .where(eq(apiKeys.id, keyId))

  await recordApiKeyAuditEvent({
    workspaceId: key.workspaceId,
    apiKeyId: key.id,
    actorUserId: key.userId,
    actorType: 'user',
    eventType: 'paused',
    keyPrefix: key.keyPrefix,
    ...requestContext,
    metadata: {
      previousStatus: key.status,
      newStatus: 'paused'
    }
  })

  revalidateApiKeyPages()
}

export async function resumeApiKey(keyId: string) {
  const key = await requireOwnedApiKey(keyId)
  validateApiKeyStatusTransition(key.status, 'resume')
  const { eq, db, apiKeys } = await getApiKeyDependencies()
  const requestContext = await getApiKeyAuditRequestContext()

  await db
    .update(apiKeys)
    .set({ status: 'active', revokedAt: null })
    .where(eq(apiKeys.id, keyId))

  await recordApiKeyAuditEvent({
    workspaceId: key.workspaceId,
    apiKeyId: key.id,
    actorUserId: key.userId,
    actorType: 'user',
    eventType: 'resumed',
    keyPrefix: key.keyPrefix,
    ...requestContext,
    metadata: {
      previousStatus: key.status,
      newStatus: 'active'
    }
  })

  revalidateApiKeyPages()
}
