import { beforeEach, describe, expect, test, vi } from 'vitest'

const {
  mockApplyInsForgeBackendResourcePlan,
  mockDecryptInsForgeAdminKey,
  mockEnforceBrokCodeAccountOwnership,
  mockGetBrokCodeProject,
  mockGetBrokCodeProjectBackend,
  mockPublicBrokCodeBackendMetadata,
  mockResolveBrokCodeRequestAuth,
  mockUpdateBrokCodeProjectMetadata
} = vi.hoisted(() => ({
  mockApplyInsForgeBackendResourcePlan: vi.fn(),
  mockDecryptInsForgeAdminKey: vi.fn(),
  mockEnforceBrokCodeAccountOwnership: vi.fn(),
  mockGetBrokCodeProject: vi.fn(),
  mockGetBrokCodeProjectBackend: vi.fn(),
  mockPublicBrokCodeBackendMetadata: vi.fn(),
  mockResolveBrokCodeRequestAuth: vi.fn(),
  mockUpdateBrokCodeProjectMetadata: vi.fn()
}))

vi.mock('@/lib/brokcode/account-guard', () => ({
  enforceBrokCodeAccountOwnership: mockEnforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth: mockResolveBrokCodeRequestAuth
}))

vi.mock('@/lib/brokcode/backend-provider', () => ({
  decryptInsForgeAdminKey: mockDecryptInsForgeAdminKey,
  publicBrokCodeBackendMetadata: mockPublicBrokCodeBackendMetadata
}))

vi.mock('@/lib/brokcode/insforge-backend-apply', () => ({
  applyInsForgeBackendResourcePlan: mockApplyInsForgeBackendResourcePlan
}))

vi.mock('@/lib/brokcode/project-store', () => ({
  getBrokCodeProject: mockGetBrokCodeProject,
  getBrokCodeProjectBackend: mockGetBrokCodeProjectBackend,
  updateBrokCodeProjectMetadata: mockUpdateBrokCodeProjectMetadata
}))

import { POST } from '../route'

const ownerAuth = {
  success: true,
  apiKey: { userId: 'user-owner' },
  workspace: { id: 'workspace-owner' }
}

const backendPlan = {
  provider: 'insforge',
  status: 'planned',
  migrationSql: 'create table public.todos (id uuid primary key);',
  storageBuckets: [],
  functions: []
}

const backend = {
  provider: 'insforge',
  projectUrl: 'https://example.insforge.app',
  encryptedAdminKey: 'encrypted'
}

function routeParams(id = 'project-1') {
  return { params: Promise.resolve({ id }) }
}

function request(body: unknown = {}) {
  return new Request(
    'http://localhost/api/brokcode/projects/project-1/backend/apply',
    {
      method: 'POST',
      body: JSON.stringify(body)
    }
  )
}

describe('BrokCode backend apply route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveBrokCodeRequestAuth.mockResolvedValue({ authResult: ownerAuth })
    mockEnforceBrokCodeAccountOwnership.mockResolvedValue(null)
    mockGetBrokCodeProject.mockResolvedValue({
      id: 'project-1',
      name: 'CRM',
      metadata: {
        preview: {
          backendPlan
        }
      }
    })
    mockGetBrokCodeProjectBackend.mockReturnValue(backend)
    mockDecryptInsForgeAdminKey.mockReturnValue('admin-key')
    mockPublicBrokCodeBackendMetadata.mockImplementation(value => ({
      ...value,
      encryptedAdminKey: undefined
    }))
    mockApplyInsForgeBackendResourcePlan.mockResolvedValue({
      provider: 'insforge',
      status: 'applied',
      dryRun: false,
      appliedAt: '2026-06-16T00:00:00.000Z',
      migrationVersion: '20260616000000',
      migrationName: 'brokcode-crm',
      steps: []
    })
    mockUpdateBrokCodeProjectMetadata.mockResolvedValue({})
  })

  test('requires owner authentication', async () => {
    mockResolveBrokCodeRequestAuth.mockResolvedValue({
      authResult: {
        success: false,
        status: 401,
        error: { code: 'missing_api_key' }
      }
    })

    const response = await POST(request(), routeParams())
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('missing_api_key')
    expect(mockApplyInsForgeBackendResourcePlan).not.toHaveBeenCalled()
  })

  test('applies the persisted plan to the connected InsForge backend', async () => {
    const response = await POST(request(), routeParams())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mockApplyInsForgeBackendResourcePlan).toHaveBeenCalledWith({
      projectUrl: 'https://example.insforge.app',
      adminKey: 'admin-key',
      plan: backendPlan,
      migrationNameSeed: 'CRM',
      dryRun: false
    })
    expect(mockUpdateBrokCodeProjectMetadata).toHaveBeenCalledWith({
      projectId: 'project-1',
      workspaceId: 'workspace-owner',
      userId: 'user-owner',
      metadata: {
        preview: {
          backendPlan,
          backendApply: body.result
        }
      }
    })
    expect(body.result.status).toBe('applied')
    expect(body.backend.encryptedAdminKey).toBeUndefined()
  })

  test('does not apply without a connected backend', async () => {
    mockGetBrokCodeProjectBackend.mockReturnValue({
      provider: 'none',
      status: 'not_configured'
    })

    const response = await POST(request(), routeParams())
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.error).toMatch(/not connected/i)
    expect(mockApplyInsForgeBackendResourcePlan).not.toHaveBeenCalled()
  })

  test('returns bad gateway when InsForge apply fails', async () => {
    mockApplyInsForgeBackendResourcePlan.mockResolvedValue({
      provider: 'insforge',
      status: 'failed',
      dryRun: false,
      appliedAt: '2026-06-16T00:00:00.000Z',
      migrationVersion: null,
      migrationName: 'brokcode-crm',
      steps: [{ id: 'migration', label: 'Apply', status: 'failed' }]
    })

    const response = await POST(request(), routeParams())
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body.result.status).toBe('failed')
    expect(mockUpdateBrokCodeProjectMetadata).toHaveBeenCalled()
  })
})
