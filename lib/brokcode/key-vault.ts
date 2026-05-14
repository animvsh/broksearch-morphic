import { and, desc, eq } from 'drizzle-orm'
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from 'node:crypto'

import { db } from '@/lib/db'
import { apiKeys, brokCodeRuntimeKeys } from '@/lib/db/schema'

const ENCRYPTION_PREFIX = 'v1'

type VerifiedRuntimeKey = {
  apiKey: typeof apiKeys.$inferSelect
  workspaceId: string
  userId: string
  rawKey: string
  defaultSessionId?: string
}

function getEncryptionSecret() {
  const secret =
    process.env.BROKCODE_KEY_ENCRYPTION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.DATABASE_URL

  if (!secret) {
    throw new Error(
      'BrokCode key storage requires BROKCODE_KEY_ENCRYPTION_SECRET, SUPABASE_SERVICE_ROLE_KEY, or DATABASE_URL.'
    )
  }

  return createHash('sha256').update(secret).digest()
}

function encryptSecret(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getEncryptionSecret(), iv)
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final()
  ])
  const tag = cipher.getAuthTag()

  return [
    ENCRYPTION_PREFIX,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url')
  ].join(':')
}

function decryptSecret(value: string) {
  const [version, iv, tag, encrypted] = value.split(':')
  if (version !== ENCRYPTION_PREFIX || !iv || !tag || !encrypted) {
    throw new Error('Saved BrokCode key is not in a supported format.')
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    getEncryptionSecret(),
    Buffer.from(iv, 'base64url')
  )
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final()
  ]).toString('utf8')
}

function normalizeSessionId(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return 'default'
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._:-]/g, '-')
    .slice(0, 80)
}

export function serializeRuntimeKey(
  row: typeof brokCodeRuntimeKeys.$inferSelect
) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    apiKeyId: row.apiKeyId,
    name: row.keyName,
    prefix: row.keyPrefix,
    environment: row.environment,
    scopes: row.scopes,
    defaultSessionId: row.defaultSessionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastValidatedAt: row.lastValidatedAt
  }
}

export function decryptRuntimeKey(
  row: typeof brokCodeRuntimeKeys.$inferSelect
) {
  return decryptSecret(row.encryptedKey)
}

export async function getSavedBrokCodeRuntimeKey({
  workspaceId,
  userId
}: {
  workspaceId: string
  userId: string
}) {
  const [row] = await db
    .select()
    .from(brokCodeRuntimeKeys)
    .where(
      and(
        eq(brokCodeRuntimeKeys.workspaceId, workspaceId),
        eq(brokCodeRuntimeKeys.userId, userId)
      )
    )
    .limit(1)

  return row
}

export async function getLatestSavedBrokCodeRuntimeKeyForUser(userId: string) {
  const [row] = await db
    .select()
    .from(brokCodeRuntimeKeys)
    .where(eq(brokCodeRuntimeKeys.userId, userId))
    .orderBy(desc(brokCodeRuntimeKeys.updatedAt))
    .limit(1)

  return row
}

export async function saveBrokCodeRuntimeKey({
  apiKey,
  workspaceId,
  userId,
  rawKey,
  defaultSessionId
}: VerifiedRuntimeKey) {
  const now = new Date()
  const [row] = await db
    .insert(brokCodeRuntimeKeys)
    .values({
      workspaceId,
      userId,
      apiKeyId: apiKey.id,
      keyName: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      encryptedKey: encryptSecret(rawKey),
      environment: apiKey.environment,
      scopes: apiKey.scopes,
      defaultSessionId: normalizeSessionId(defaultSessionId),
      updatedAt: now,
      lastValidatedAt: now
    })
    .onConflictDoUpdate({
      target: [brokCodeRuntimeKeys.workspaceId, brokCodeRuntimeKeys.userId],
      set: {
        apiKeyId: apiKey.id,
        keyName: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        encryptedKey: encryptSecret(rawKey),
        environment: apiKey.environment,
        scopes: apiKey.scopes,
        defaultSessionId: normalizeSessionId(defaultSessionId),
        updatedAt: now,
        lastValidatedAt: now
      }
    })
    .returning()

  return row
}

export async function deleteBrokCodeRuntimeKey({
  workspaceId,
  userId
}: {
  workspaceId: string
  userId: string
}) {
  await db
    .delete(brokCodeRuntimeKeys)
    .where(
      and(
        eq(brokCodeRuntimeKeys.workspaceId, workspaceId),
        eq(brokCodeRuntimeKeys.userId, userId)
      )
    )
}

export async function deleteBrokCodeRuntimeKeyById({
  id,
  userId
}: {
  id: string
  userId: string
}) {
  await db
    .delete(brokCodeRuntimeKeys)
    .where(
      and(
        eq(brokCodeRuntimeKeys.id, id),
        eq(brokCodeRuntimeKeys.userId, userId)
      )
    )
}
