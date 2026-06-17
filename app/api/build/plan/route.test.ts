import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateBrokBuildPlan: vi.fn(),
  requireFeatureAccessForApi: vi.fn()
}))

vi.mock('@/lib/auth/app-access', () => ({
  requireFeatureAccessForApi: mocks.requireFeatureAccessForApi
}))

vi.mock('@/lib/actions/build', () => ({
  generateBrokBuildPlan: mocks.generateBrokBuildPlan
}))

import { POST } from './route'

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/build/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

describe('Brok Build plan route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireFeatureAccessForApi.mockResolvedValue({
      ok: true,
      user: { id: 'user-1' }
    })
    mocks.generateBrokBuildPlan.mockResolvedValue({ plan: { title: 'CRM' } })
  })

  test('denies builder planning without BrokCode feature access', async () => {
    mocks.requireFeatureAccessForApi.mockResolvedValue({
      ok: false,
      response: Response.json(
        { error: 'Feature access denied', feature: 'brokcode' },
        { status: 403 }
      )
    })

    const response = await POST(request({ prompt: 'Ship a CRM' }))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toMatchObject({
      error: 'Feature access denied',
      feature: 'brokcode'
    })
    expect(mocks.generateBrokBuildPlan).not.toHaveBeenCalled()
  })

  test('generates a builder plan for accounts with BrokCode access', async () => {
    const response = await POST(request({ prompt: 'Ship a CRM' }))
    const body = await response.json()

    expect(mocks.requireFeatureAccessForApi).toHaveBeenCalledWith('brokcode')
    expect(mocks.generateBrokBuildPlan).toHaveBeenCalledWith({
      prompt: 'Ship a CRM'
    })
    expect(response.status).toBe(200)
    expect(body).toEqual({ plan: { title: 'CRM' } })
  })
})
