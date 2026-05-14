'use server'

import { revalidatePath } from 'next/cache'

import { asc, eq } from 'drizzle-orm'

import {
  generateApiKey,
  getKeyPrefix,
  hashApiKey,
  maskApiKey
} from '@/lib/api-key'
import { getRequiredBrokAccountUser } from '@/lib/brokcode/account-guard'
import { db } from '@/lib/db'
import { apiKeys, workspaces } from '@/lib/db/schema'

export interface CreateApiKeyInput {
  name: string
  environment: 'test' | 'live'
  scopes: string[]
  allowedModels: string[]
  rpmLimit: number
  dailyRequestLimit: number
  monthlyBudgetCents: number
}

export async function ensureWorkspaceForUser(userId: string) {
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
}

export async function createApiKey(
  userId: string,
  workspaceId: string,
  input: CreateApiKeyInput
) {
  const user = await getRequiredBrokAccountUser()
  if (!user || user.id !== userId) {
    throw new Error('Sign in to your Brok account before creating API keys.')
  }

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)

  if (!workspace || workspace.ownerUserId !== user.id) {
    throw new Error('This workspace does not belong to your Brok account.')
  }

  const rawKey = generateApiKey(input.environment)
  const keyHash = hashApiKey(rawKey)
  const keyPrefix = getKeyPrefix(rawKey)

  const [newKey] = await db
    .insert(apiKeys)
    .values({
      workspaceId,
      userId,
      name: input.name,
      keyPrefix,
      keyHash,
      environment: input.environment,
      scopes: input.scopes,
      allowedModels: input.allowedModels,
      rpmLimit: input.rpmLimit,
      dailyRequestLimit: input.dailyRequestLimit,
      monthlyBudgetCents: input.monthlyBudgetCents
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
  const keys = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.workspaceId, workspaceId))

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
  const user = await getRequiredBrokAccountUser()
  if (!user) {
    throw new Error('Sign in to your Brok account before managing API keys.')
  }

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
  await requireOwnedApiKey(keyId)

  await db
    .update(apiKeys)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(eq(apiKeys.id, keyId))

  revalidatePath('/api-keys')
}

export async function pauseApiKey(keyId: string) {
  await requireOwnedApiKey(keyId)

  await db
    .update(apiKeys)
    .set({ status: 'paused' })
    .where(eq(apiKeys.id, keyId))

  revalidatePath('/api-keys')
}

export async function resumeApiKey(keyId: string) {
  await requireOwnedApiKey(keyId)

  await db
    .update(apiKeys)
    .set({ status: 'active' })
    .where(eq(apiKeys.id, keyId))

  revalidatePath('/api-keys')
}
