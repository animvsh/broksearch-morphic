import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentAppAccess: vi.fn(),
  hasFeatureAccess: vi.fn(),
  isAnonymousAuthMode: vi.fn(),
  revalidatePath: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  insertValues: vi.fn(),
  returning: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  generateApiKey: vi.fn(),
  getKeyPrefix: vi.fn(),
  hashNewApiKey: vi.fn(),
  maskApiKey: vi.fn()
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath
}))

vi.mock('@/lib/auth/app-access', () => ({
  getCurrentAppAccess: mocks.getCurrentAppAccess,
  hasFeatureAccess: mocks.hasFeatureAccess
}))

vi.mock('@/lib/auth/get-current-user', () => ({
  isAnonymousAuthMode: mocks.isAnonymousAuthMode
}))

vi.mock('drizzle-orm', () => ({
  asc: vi.fn(value => value),
  desc: vi.fn(value => value),
  eq: vi.fn(() => 'predicate')
}))

vi.mock('@/lib/api-key', () => ({
  generateApiKey: mocks.generateApiKey,
  getKeyPrefix: mocks.getKeyPrefix,
  hashNewApiKey: mocks.hashNewApiKey,
  maskApiKey: mocks.maskApiKey
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update
  }
}))

vi.mock('@/lib/db/schema', () => ({
  apiKeys: {
    id: 'api_keys.id',
    workspaceId: 'api_keys.workspace_id',
    keyHash: 'api_keys.key_hash',
    keyPrefix: 'api_keys.key_prefix'
  },
  apiKeyAuditEvents: {
    workspaceId: 'api_key_audit_events.workspace_id',
    createdAt: 'api_key_audit_events.created_at'
  },
  workspaces: {
    id: 'workspaces.id',
    ownerUserId: 'workspaces.owner_user_id',
    createdAt: 'workspaces.created_at'
  }
}))

function selectLimit(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(rows)
      }))
    }))
  }
}

function selectWhere(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(rows)
    }))
  }
}

describe('api key actions', () => {
  const now = new Date('2026-06-16T21:30:00.000Z')
  const sourceKey = {
    id: 'old-key-id',
    workspaceId: 'workspace-id',
    userId: 'user-id',
    name: 'Production app',
    keyPrefix: 'brok_sk_live_old123',
    keyHash: 'old-hash',
    keySalt: 'old-salt',
    environment: 'live' as const,
    status: 'active' as const,
    scopes: ['chat:write', 'usage:read'],
    allowedModels: ['brok-fast'],
    rpmLimit: 120,
    dailyRequestLimit: 10000,
    monthlyBudgetCents: 2500,
    lastUsedAt: null,
    createdAt: now,
    revokedAt: null,
    rotatedFromKeyId: null,
    rotatedToKeyId: null,
    rotatedAt: null
  }
  const workspace = {
    id: 'workspace-id',
    ownerUserId: 'user-id',
    name: 'Personal Workspace'
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCurrentAppAccess.mockResolvedValue({ user: { id: 'user-id' } })
    mocks.hasFeatureAccess.mockReturnValue(true)
    mocks.isAnonymousAuthMode.mockReturnValue(false)
    mocks.generateApiKey.mockReturnValue('brok_sk_live_replacement_secret')
    mocks.getKeyPrefix.mockReturnValue('brok_sk_live_new123')
    mocks.hashNewApiKey.mockReturnValue({
      hash: 'new-hash',
      salt: 'new-salt'
    })
    mocks.maskApiKey.mockImplementation((value: string) => `${value}:masked`)
    mocks.insert.mockReturnValue({ values: mocks.insertValues })
    mocks.insertValues.mockReturnValue({ returning: mocks.returning })
    mocks.update.mockReturnValue({ set: mocks.updateSet })
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere })
    mocks.updateWhere.mockResolvedValue(undefined)
  })

  it('creates a rotated key with inherited access while keeping the old key active', async () => {
    const createdKey = {
      ...sourceKey,
      id: 'new-key-id',
      name: 'Production app replacement',
      keyPrefix: 'brok_sk_live_new123',
      keyHash: 'new-hash',
      keySalt: 'new-salt',
      rotatedFromKeyId: 'old-key-id',
      rotatedAt: now,
      createdAt: now
    }
    mocks.select
      .mockReturnValueOnce(selectLimit([sourceKey]))
      .mockReturnValueOnce(selectLimit([workspace]))
    mocks.returning.mockResolvedValueOnce([createdKey])

    const { rotateApiKey } = await import('../api-keys')
    const result = await rotateApiKey('old-key-id')

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-id',
        userId: 'user-id',
        name: 'Production app replacement',
        keyPrefix: 'brok_sk_live_new123',
        keyHash: 'new-hash',
        keySalt: 'new-salt',
        environment: 'live',
        scopes: ['chat:write', 'usage:read'],
        allowedModels: ['brok-fast'],
        rpmLimit: 120,
        dailyRequestLimit: 10000,
        monthlyBudgetCents: 2500,
        rotatedFromKeyId: 'old-key-id'
      })
    )
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        rotatedToKeyId: 'new-key-id'
      })
    )
    expect(mocks.updateSet.mock.calls[0][0]).not.toHaveProperty('status')
    expect(mocks.updateSet.mock.calls[0][0]).not.toHaveProperty('revokedAt')
    expect(result).toMatchObject({
      id: 'new-key-id',
      key: 'brok_sk_live_replacement_secret',
      rotatedFromKeyId: 'old-key-id'
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/api-keys')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/api-platform/keys')
  })

  it('lists rotation history without re-revealing raw secrets', async () => {
    const newKey = {
      ...sourceKey,
      id: 'new-key-id',
      name: 'Production app replacement',
      keyPrefix: 'brok_sk_live_new123',
      keyHash: 'new-hash',
      keySalt: 'new-salt',
      rotatedFromKeyId: 'old-key-id',
      rotatedToKeyId: null,
      rotatedAt: now,
      createdAt: now
    }
    const oldKey = {
      ...sourceKey,
      rotatedToKeyId: 'new-key-id',
      rotatedAt: now
    }
    mocks.select
      .mockReturnValueOnce(selectLimit([workspace]))
      .mockReturnValueOnce(selectWhere([oldKey, newKey]))

    const { listApiKeys } = await import('../api-keys')
    const keys = await listApiKeys('workspace-id')

    expect(keys[0]).not.toHaveProperty('key')
    expect(keys[1]).not.toHaveProperty('key')
    expect(keys[0].rotatedToKey).toMatchObject({
      id: 'new-key-id',
      maskedKey: 'brok_sk_live_new123xxxxxxxx:masked'
    })
    expect(keys[1].rotatedFromKey).toMatchObject({
      id: 'old-key-id',
      maskedKey: 'brok_sk_live_old123xxxxxxxx:masked'
    })
  })
})
