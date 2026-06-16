import { and, asc, eq, lt } from 'drizzle-orm'

import { generateApiKey, getKeyPrefix, hashNewApiKey } from '@/lib/api-key'
import {
  recordApiKeyAuditEvent,
  recordApiKeyAuditEvents
} from '@/lib/brok/api-key-audit'
import {
  decryptBrokCodeSecret,
  encryptBrokCodeSecret
} from '@/lib/brokcode/key-vault'
import { db } from '@/lib/db'
import { apiKeys, playgroundSessionKeys, workspaces } from '@/lib/db/schema'

const PLAYGROUND_SESSION_TTL_MS = 24 * 60 * 60 * 1000
const PLAYGROUND_SCOPES = ['chat:write', 'search:write', 'usage:read']

async function ensurePlaygroundWorkspace(userId: string) {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.ownerUserId, userId))
    .orderBy(asc(workspaces.createdAt))
    .limit(1)

  if (workspace) return workspace

  const [created] = await db
    .insert(workspaces)
    .values({
      name: 'Personal Workspace',
      ownerUserId: userId
    })
    .returning()

  return created
}

async function revokePreviousSessionKey(
  apiKeyId: string | null | undefined,
  reason: 'expired' | 'rotated'
) {
  if (!apiKeyId) return

  try {
    const [key] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, apiKeyId))
      .limit(1)

    if (!key || key.status === 'revoked') {
      return
    }

    await db
      .update(apiKeys)
      .set({ status: 'revoked', revokedAt: new Date() })
      .where(eq(apiKeys.id, apiKeyId))

    await recordApiKeyAuditEvent({
      workspaceId: key.workspaceId,
      apiKeyId: key.id,
      actorUserId: key.userId,
      actorType: 'system',
      eventType: 'revoked',
      keyPrefix: key.keyPrefix,
      metadata: {
        previousStatus: key.status,
        newStatus: 'revoked',
        source: 'playground_session_key',
        reason
      }
    })
  } catch (error) {
    console.error('Failed to revoke expired playground session key:', error)
  }
}

export async function getOrCreatePlaygroundSessionKey(userId: string) {
  const workspace = await ensurePlaygroundWorkspace(userId)
  const now = new Date()
  const [existing] = await db
    .select()
    .from(playgroundSessionKeys)
    .where(
      and(
        eq(playgroundSessionKeys.workspaceId, workspace.id),
        eq(playgroundSessionKeys.userId, userId)
      )
    )
    .limit(1)

  if (existing && existing.expiresAt > now) {
    await db
      .update(playgroundSessionKeys)
      .set({ lastUsedAt: now, updatedAt: now })
      .where(eq(playgroundSessionKeys.id, existing.id))
      .catch(error => {
        console.error('Failed to touch playground session key:', error)
      })

    return {
      rawKey: decryptBrokCodeSecret(existing.encryptedKey),
      workspace,
      expiresAt: existing.expiresAt,
      keyPrefix: existing.keyPrefix
    }
  }

  await revokePreviousSessionKey(existing?.apiKeyId, 'rotated')

  const rawKey = generateApiKey('test')
  const { hash: keyHash, salt: keySalt } = hashNewApiKey(rawKey)
  const keyPrefix = getKeyPrefix(rawKey)
  const expiresAt = new Date(now.getTime() + PLAYGROUND_SESSION_TTL_MS)
  const [apiKey] = await db
    .insert(apiKeys)
    .values({
      workspaceId: workspace.id,
      userId,
      name: 'Playground session key',
      keyPrefix,
      keyHash,
      keySalt,
      environment: 'test',
      scopes: PLAYGROUND_SCOPES,
      allowedModels: [],
      rpmLimit: 60,
      dailyRequestLimit: 1000,
      monthlyBudgetCents: 1000
    })
    .returning()

  await recordApiKeyAuditEvents([
    {
      workspaceId: workspace.id,
      apiKeyId: apiKey.id,
      actorUserId: userId,
      actorType: 'system',
      eventType: 'created',
      keyPrefix: apiKey.keyPrefix,
      metadata: {
        source: 'playground_session_key',
        environment: apiKey.environment,
        scopes: apiKey.scopes,
        expiresAt
      }
    },
    {
      workspaceId: workspace.id,
      apiKeyId: apiKey.id,
      actorUserId: userId,
      actorType: 'system',
      eventType: 'expiry_updated',
      keyPrefix: apiKey.keyPrefix,
      metadata: {
        source: 'playground_session_key',
        expiresAt
      }
    }
  ])

  const encryptedKey = encryptBrokCodeSecret(rawKey)
  await db
    .insert(playgroundSessionKeys)
    .values({
      workspaceId: workspace.id,
      userId,
      apiKeyId: apiKey.id,
      keyPrefix,
      encryptedKey,
      environment: 'test',
      scopes: PLAYGROUND_SCOPES,
      expiresAt,
      updatedAt: now,
      lastUsedAt: now
    })
    .onConflictDoUpdate({
      target: [playgroundSessionKeys.workspaceId, playgroundSessionKeys.userId],
      set: {
        apiKeyId: apiKey.id,
        keyPrefix,
        encryptedKey,
        environment: 'test',
        scopes: PLAYGROUND_SCOPES,
        expiresAt,
        updatedAt: now,
        lastUsedAt: now
      }
    })

  return {
    rawKey,
    workspace,
    expiresAt,
    keyPrefix
  }
}

export async function expirePlaygroundSessionKeys() {
  const now = new Date()
  const expired = await db
    .select()
    .from(playgroundSessionKeys)
    .where(lt(playgroundSessionKeys.expiresAt, now))

  for (const row of expired) {
    await revokePreviousSessionKey(row.apiKeyId, 'expired')
  }

  return expired.length
}
