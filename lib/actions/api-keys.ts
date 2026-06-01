'use server'

import { revalidatePath } from 'next/cache'

import { asc, eq } from 'drizzle-orm'

import {
  generateApiKey,
  getKeyPrefix,
  hashNewApiKey,
  maskApiKey
} from '@/lib/api-key'
import { getCurrentAppAccess, hasFeatureAccess } from '@/lib/auth/app-access'
import { isAnonymousAuthMode } from '@/lib/auth/get-current-user'
import {
  validateApiKeyStatusTransition,
  validateCreateApiKeyInput
} from '@/lib/brok/api-platform'
import type { CreateApiKeyInput } from '@/lib/brok/api-platform'
import { db } from '@/lib/db'
import { apiKeys, workspaces } from '@/lib/db/schema'

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

export async function ensureWorkspaceForUser(userId: string) {
  try {
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
      monthlyBudgetCents: validatedInput.monthlyBudgetCents
    })
    .returning()

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
    createdAt: newKey.createdAt
  }
}

export async function listApiKeys(workspaceId: string) {
  const user = await requireApiPlatformUser()

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
    createdAt: key.createdAt
  }))
}

async function requireOwnedApiKey(keyId: string) {
  const user = await requireApiPlatformUser()

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

  await db
    .update(apiKeys)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(eq(apiKeys.id, keyId))

  revalidatePath('/api-keys')
}

export async function pauseApiKey(keyId: string) {
  const key = await requireOwnedApiKey(keyId)
  validateApiKeyStatusTransition(key.status, 'pause')

  await db
    .update(apiKeys)
    .set({ status: 'paused' })
    .where(eq(apiKeys.id, keyId))

  revalidatePath('/api-keys')
}

export async function resumeApiKey(keyId: string) {
  const key = await requireOwnedApiKey(keyId)
  validateApiKeyStatusTransition(key.status, 'resume')

  await db
    .update(apiKeys)
    .set({ status: 'active', revokedAt: null })
    .where(eq(apiKeys.id, keyId))

  revalidatePath('/api-keys')
}
