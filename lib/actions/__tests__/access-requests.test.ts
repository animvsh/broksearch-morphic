import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  headers: vi.fn(),
  revalidatePath: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoUpdate: vi.fn()
}))

vi.mock('next/headers', () => ({
  headers: mocks.headers
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath
}))

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: mocks.getCurrentUser
}))

vi.mock('@/lib/db', () => ({
  db: {
    insert: mocks.insert
  }
}))

vi.mock('@/lib/db/schema', () => ({
  appAccessRequests: {
    email: 'email'
  }
}))

describe('submitAccessRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.headers.mockResolvedValue(new Headers({ 'user-agent': 'vitest' }))
    mocks.getCurrentUser.mockResolvedValue(null)
    mocks.onConflictDoUpdate.mockResolvedValue(undefined)
    mocks.values.mockReturnValue({
      onConflictDoUpdate: mocks.onConflictDoUpdate
    })
    mocks.insert.mockReturnValue({ values: mocks.values })
  })

  it('rejects invalid email and phone values', async () => {
    const { submitAccessRequest } = await import('../access-requests')
    const formData = new FormData()
    formData.set('email', 'not-an-email')
    formData.set('phoneNumber', '12')

    const result = await submitAccessRequest({ status: 'idle' }, formData)

    expect(result).toMatchObject({
      status: 'error',
      message: 'Please fix the highlighted fields.'
    })
    expect(result.fieldErrors?.email).toBeTruthy()
    expect(result.fieldErrors?.phoneNumber).toBeTruthy()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('persists a normalized pending public access request', async () => {
    const { submitAccessRequest } = await import('../access-requests')
    const formData = new FormData()
    formData.set('email', ' Founder@Example.COM ')
    formData.set('phoneNumber', ' +1   555 123 4567 ')

    const result = await submitAccessRequest({ status: 'idle' }, formData)

    expect(result).toMatchObject({
      status: 'success',
      email: 'founder@example.com'
    })
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'founder@example.com',
        phoneNumber: '+1 555 123 4567',
        status: 'pending',
        userId: null,
        source: 'public_auth_form',
        userAgent: 'vitest'
      })
    )
    expect(mocks.onConflictDoUpdate).toHaveBeenCalledWith({
      target: 'email',
      set: expect.objectContaining({
        email: 'founder@example.com',
        phoneNumber: '+1 555 123 4567',
        status: 'pending'
      })
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/access')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/brok')
  })

  it('attaches the signed-in pending user when available', async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: 'user_123',
      email: 'pending@example.com'
    })
    const { submitAccessRequest } = await import('../access-requests')
    const formData = new FormData()
    formData.set('email', 'pending@example.com')
    formData.set('phoneNumber', '555-123-4567')

    await submitAccessRequest({ status: 'idle' }, formData)

    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_123',
        source: 'signed_in_access_pending'
      })
    )
  })
})
