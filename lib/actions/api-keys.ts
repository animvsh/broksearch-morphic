'use server';

import { revalidatePath } from 'next/cache';

import { eq } from 'drizzle-orm';

import { generateApiKey, getKeyPrefix,hashApiKey, maskApiKey } from '@/lib/api-key';
import { db } from '@/lib/db';
import { apiKeys, workspaces } from '@/lib/db/schema';

export interface CreateApiKeyInput {
  name: string;
  environment: 'test' | 'live';
  scopes: string[];
  allowedModels: string[];
  rpmLimit: number;
  dailyRequestLimit: number;
  monthlyBudgetCents: number;
}

export async function createApiKey(userId: string, workspaceId: string, input: CreateApiKeyInput) {
  const rawKey = generateApiKey(input.environment);
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = getKeyPrefix(rawKey);

  const [newKey] = await db.insert(apiKeys).values({
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
    monthlyBudgetCents: input.monthlyBudgetCents,
  }).returning();

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
    createdAt: newKey.createdAt,
  };
}

export async function listApiKeys(workspaceId: string) {
  const keys = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.workspaceId, workspaceId));

  return keys.map(key => ({
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    maskedKey: maskApiKey(key.keyPrefix + 'xxxxxxxx'),
    environment: key.environment,
    status: key.status,
    scopes: key.scopes,
    allowedModels: key.allowedModels,
    rpmLimit: key.rpmLimit,
    dailyRequestLimit: key.dailyRequestLimit,
    monthlyBudgetCents: key.monthlyBudgetCents,
    lastUsedAt: key.lastUsedAt,
    createdAt: key.createdAt,
  }));
}

export async function revokeApiKey(keyId: string) {
  await db
    .update(apiKeys)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(eq(apiKeys.id, keyId));

  revalidatePath('/api-keys');
}

export async function pauseApiKey(keyId: string) {
  await db
    .update(apiKeys)
    .set({ status: 'paused' })
    .where(eq(apiKeys.id, keyId));

  revalidatePath('/api-keys');
}

export async function resumeApiKey(keyId: string) {
  await db
    .update(apiKeys)
    .set({ status: 'active' })
    .where(eq(apiKeys.id, keyId));

  revalidatePath('/api-keys');
}
