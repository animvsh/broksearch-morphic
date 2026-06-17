import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getAppAccessForUser,
  hasFeatureAccess,
  isAppAccessGateEnabled
} from '../app-access'

const dbMocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn()
}))

vi.mock('@/lib/db', () => ({
  db: { select: dbMocks.select }
}))

vi.mock('@/lib/db/schema', () => ({
  appAccessAllowlist: {
    id: 'id',
    email: 'email',
    status: 'status',
    features: 'features'
  }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'predicate')
}))

describe('app access gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('stays disabled outside cloud mode unless explicitly enabled', () => {
    vi.stubEnv('BROK_CLOUD_DEPLOYMENT', 'false')
    vi.stubEnv('APP_ACCESS_GATE', 'false')

    expect(isAppAccessGateEnabled()).toBe(false)
  })

  it('allows configured admin emails even before database lookup', async () => {
    vi.stubEnv('BROK_CLOUD_DEPLOYMENT', 'true')
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com')

    await expect(
      getAppAccessForUser({
        id: 'user_1',
        email: 'ADMIN@example.com',
        app_metadata: {}
      } as any)
    ).resolves.toMatchObject({ allowed: true, source: 'admin' })
    expect(dbMocks.select).not.toHaveBeenCalled()
  })

  it('recognizes aalang@ucsc.edu as all-tools access from admin config', async () => {
    vi.stubEnv('BROK_CLOUD_DEPLOYMENT', 'true')
    vi.stubEnv('ADMIN_EMAILS', 'aalang@ucsc.edu')

    await expect(
      getAppAccessForUser({
        id: 'user_aalang',
        email: 'AALANG@ucsc.edu',
        app_metadata: {}
      } as any)
    ).resolves.toMatchObject({
      allowed: true,
      source: 'admin',
      features: 'all'
    })
    expect(dbMocks.select).not.toHaveBeenCalled()
  })

  it('recognizes aalang@ucsc.edu as all-tools access from the local dev seed', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('APP_ACCESS_GATE', 'true')
    vi.stubEnv('ADMIN_EMAILS', '')

    await expect(
      getAppAccessForUser({
        id: 'user_aalang',
        email: 'AALANG@ucsc.edu',
        app_metadata: {}
      } as any)
    ).resolves.toMatchObject({
      allowed: true,
      source: 'admin',
      features: 'all'
    })
    expect(dbMocks.select).not.toHaveBeenCalled()
  })

  it('does not use the local dev seed in production cloud mode', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('BROK_CLOUD_DEPLOYMENT', 'true')
    vi.stubEnv('ADMIN_EMAILS', '')
    dbMocks.limit.mockResolvedValue([])
    dbMocks.where.mockReturnValue({ limit: dbMocks.limit })
    dbMocks.from.mockReturnValue({ where: dbMocks.where })
    dbMocks.select.mockReturnValue({ from: dbMocks.from })

    await expect(
      getAppAccessForUser({
        id: 'user_aalang',
        email: 'aalang@ucsc.edu',
        app_metadata: {}
      } as any)
    ).resolves.toMatchObject({ allowed: false, reason: 'not_allowed' })
  })

  it('recognizes aalang@ucsc.edu as all-tools access from app allowlist config', async () => {
    vi.stubEnv('BROK_CLOUD_DEPLOYMENT', 'true')
    vi.stubEnv('BROK_LOCAL_DEV_ACCESS_SEED', 'false')
    vi.stubEnv('ADMIN_EMAILS', '')
    vi.stubEnv('APP_ALLOWED_EMAILS', 'aalang@ucsc.edu')

    await expect(
      getAppAccessForUser({
        id: 'user_aalang',
        email: 'aalang@ucsc.edu',
        app_metadata: {}
      } as any)
    ).resolves.toMatchObject({
      allowed: true,
      source: 'env',
      features: 'all'
    })
    expect(dbMocks.select).not.toHaveBeenCalled()
  })

  it('allows active database allowlist rows', async () => {
    vi.stubEnv('BROK_CLOUD_DEPLOYMENT', 'true')
    dbMocks.limit.mockResolvedValue([
      { id: 'row_1', status: 'active', features: null }
    ])
    dbMocks.where.mockReturnValue({ limit: dbMocks.limit })
    dbMocks.from.mockReturnValue({ where: dbMocks.where })
    dbMocks.select.mockReturnValue({ from: dbMocks.from })

    await expect(
      getAppAccessForUser({
        id: 'user_1',
        email: 'user@example.com',
        app_metadata: {}
      } as any)
    ).resolves.toMatchObject({
      allowed: true,
      source: 'database',
      features: 'all'
    })
  })

  it('recognizes aalang@ucsc.edu as all-tools access from a seeded database allowlist row', async () => {
    vi.stubEnv('BROK_CLOUD_DEPLOYMENT', 'true')
    vi.stubEnv('BROK_LOCAL_DEV_ACCESS_SEED', 'false')
    vi.stubEnv('ADMIN_EMAILS', '')
    dbMocks.limit.mockResolvedValue([
      { id: 'row_aalang', status: 'active', features: null }
    ])
    dbMocks.where.mockReturnValue({ limit: dbMocks.limit })
    dbMocks.from.mockReturnValue({ where: dbMocks.where })
    dbMocks.select.mockReturnValue({ from: dbMocks.from })

    await expect(
      getAppAccessForUser({
        id: 'user_aalang',
        email: 'aalang@ucsc.edu',
        app_metadata: {}
      } as any)
    ).resolves.toMatchObject({
      allowed: true,
      source: 'database',
      features: 'all'
    })
  })

  it('preserves feature scopes from database allowlist rows', async () => {
    vi.stubEnv('BROK_CLOUD_DEPLOYMENT', 'true')
    dbMocks.limit.mockResolvedValue([
      { id: 'row_1', status: 'active', features: ['search'] }
    ])
    dbMocks.where.mockReturnValue({ limit: dbMocks.limit })
    dbMocks.from.mockReturnValue({ where: dbMocks.where })
    dbMocks.select.mockReturnValue({ from: dbMocks.from })

    const access = await getAppAccessForUser({
      id: 'user_1',
      email: 'user@example.com',
      app_metadata: {}
    } as any)

    expect(access).toMatchObject({
      allowed: true,
      source: 'database',
      features: ['search']
    })
    expect(hasFeatureAccess(access, 'search')).toBe(true)
    expect(hasFeatureAccess(access, 'brokcode')).toBe(false)
  })

  it('denies signed-in users who are not allowlisted in cloud mode', async () => {
    vi.stubEnv('BROK_CLOUD_DEPLOYMENT', 'true')
    dbMocks.limit.mockResolvedValue([])
    dbMocks.where.mockReturnValue({ limit: dbMocks.limit })
    dbMocks.from.mockReturnValue({ where: dbMocks.where })
    dbMocks.select.mockReturnValue({ from: dbMocks.from })

    await expect(
      getAppAccessForUser({
        id: 'user_1',
        email: 'user@example.com',
        app_metadata: {}
      } as any)
    ).resolves.toMatchObject({ allowed: false, reason: 'not_allowed' })
  })
})
