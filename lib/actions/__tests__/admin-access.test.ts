import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  values: vi.fn(),
  onConflictDoUpdate: vi.fn(),
  set: vi.fn(),
  where: vi.fn()
}))

const mockRequireAdminAccess = vi.hoisted(() => vi.fn())
const mockRevalidatePath = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath
}))

vi.mock('@/lib/auth/admin', () => ({
  requireAdminAccess: mockRequireAdminAccess
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: dbMocks.select,
    insert: dbMocks.insert,
    update: dbMocks.update
  }
}))

vi.mock('@/lib/db/schema', () => ({
  appAccessAllowlist: {
    id: 'id',
    email: 'email',
    status: 'status',
    features: 'features',
    note: 'note',
    createdBy: 'createdBy',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    revokedAt: 'revokedAt'
  },
  appAccessRequests: {
    id: 'requestId',
    email: 'requestEmail',
    phoneNumber: 'phoneNumber',
    status: 'requestStatus',
    userId: 'userId',
    source: 'source',
    createdAt: 'requestCreatedAt',
    updatedAt: 'requestUpdatedAt',
    reviewedAt: 'reviewedAt',
    reviewedBy: 'reviewedBy'
  }
}))

vi.mock('drizzle-orm', () => ({
  asc: vi.fn(value => value),
  desc: vi.fn(value => value),
  eq: vi.fn(() => 'predicate')
}))

function makeFormData(entries: Array<[string, string]>) {
  const formData = new FormData()
  for (const [key, value] of entries) {
    formData.append(key, value)
  }
  return formData
}

describe('admin access actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAdminAccess.mockResolvedValue({
      ok: true,
      user: { id: 'admin-user', email: 'admin@example.com' }
    })
    dbMocks.insert.mockReturnValue({ values: dbMocks.values })
    dbMocks.values.mockReturnValue({
      onConflictDoUpdate: dbMocks.onConflictDoUpdate
    })
    dbMocks.onConflictDoUpdate.mockResolvedValue(undefined)
    dbMocks.update.mockReturnValue({ set: dbMocks.set })
    dbMocks.set.mockReturnValue({ where: dbMocks.where })
    dbMocks.where.mockResolvedValue(undefined)
  })

  it('parses all-tools grants as a durable null feature scope', async () => {
    const { parseAllowlistFeatureGrant } = await import('../admin-access-utils')

    const formData = makeFormData([
      ['featureScope', 'all'],
      ['features', 'search']
    ])

    expect(parseAllowlistFeatureGrant(formData)).toBeNull()
  })

  it('parses specific feature grants and drops unsupported values', async () => {
    const { parseAllowlistFeatureGrant } = await import('../admin-access-utils')

    const formData = makeFormData([
      ['featureScope', 'specific'],
      ['features', 'search'],
      ['features', 'tools'],
      ['features', 'unknown']
    ])

    expect(parseAllowlistFeatureGrant(formData)).toEqual(['search', 'tools'])
  })

  it('treats every selected feature as all-tools access', async () => {
    const { APP_FEATURES } = await import('@/lib/auth/app-access')
    const { parseAllowlistFeatureGrant } = await import('../admin-access-utils')
    const formData = makeFormData([
      ['featureScope', 'specific'],
      ...APP_FEATURES.map(feature => ['features', feature] as [string, string])
    ])

    expect(parseAllowlistFeatureGrant(formData)).toBeNull()
  })

  it('requires at least one feature for specific access', async () => {
    const { parseAllowlistFeatureGrant } = await import('../admin-access-utils')
    const formData = makeFormData([['featureScope', 'specific']])

    expect(() => parseAllowlistFeatureGrant(formData)).toThrow(
      'Choose at least one feature'
    )
  })

  it('upserts active grants by normalized email', async () => {
    const { grantAppAccessByEmail } = await import('../admin-access')
    const formData = makeFormData([
      ['email', ' Founder@Example.COM '],
      ['note', 'Launch cohort'],
      ['featureScope', 'all']
    ])

    await grantAppAccessByEmail(formData)

    expect(dbMocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'email' })
    )
    expect(dbMocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'founder@example.com',
        status: 'active',
        features: null,
        note: 'Launch cohort',
        createdBy: 'admin-user',
        revokedAt: null
      })
    )
    expect(dbMocks.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'email',
        set: expect.objectContaining({
          status: 'active',
          features: null,
          note: 'Launch cohort',
          revokedAt: null
        })
      })
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/access')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/brok')
  })

  it('marks a request approved when granting from a pending request row', async () => {
    const { grantAppAccessByEmail } = await import('../admin-access')
    const formData = makeFormData([
      ['requestId', 'request-1'],
      ['email', 'requester@example.com'],
      ['note', 'Approved from request'],
      ['featureScope', 'all']
    ])

    await grantAppAccessByEmail(formData)

    expect(dbMocks.update).toHaveBeenCalled()
    expect(dbMocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'approved',
        reviewedBy: 'admin-user'
      })
    )
    expect(dbMocks.where).toHaveBeenCalledWith('predicate')
  })

  it('rejects a pending request without creating an allowlist grant', async () => {
    const { rejectAppAccessRequest } = await import('../admin-access')
    const formData = makeFormData([['requestId', 'request-2']])

    await rejectAppAccessRequest(formData)

    expect(dbMocks.insert).not.toHaveBeenCalled()
    expect(dbMocks.update).toHaveBeenCalled()
    expect(dbMocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'rejected',
        reviewedBy: 'admin-user'
      })
    )
  })

  it('updates existing rows with scoped feature access', async () => {
    const { updateAppAccessAllowlistFeatures } = await import('../admin-access')
    const formData = makeFormData([
      ['id', 'grant-1'],
      ['featureScope', 'specific'],
      ['features', 'brokmail'],
      ['features', 'presentations']
    ])

    await updateAppAccessAllowlistFeatures(formData)

    expect(dbMocks.update).toHaveBeenCalled()
    expect(dbMocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        features: ['brokmail', 'presentations']
      })
    )
    expect(dbMocks.where).toHaveBeenCalledWith('predicate')
  })
})
