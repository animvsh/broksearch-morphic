import { beforeEach, describe, expect, test, vi } from 'vitest'

const {
  mockDecryptInsForgeAdminKey,
  mockEnforceBrokCodeAccountOwnership,
  mockFetchInsForgeBackendContext,
  mockFormatInsForgeBackendContextForPrompt,
  mockGetBrokCodeProject,
  mockGetBrokCodeProjectBackend,
  mockPublicBrokCodeBackendMetadata,
  mockResolveBrokCodeRequestAuth
} = vi.hoisted(() => ({
  mockDecryptInsForgeAdminKey: vi.fn(),
  mockEnforceBrokCodeAccountOwnership: vi.fn(),
  mockFetchInsForgeBackendContext: vi.fn(),
  mockFormatInsForgeBackendContextForPrompt: vi.fn(),
  mockGetBrokCodeProject: vi.fn(),
  mockGetBrokCodeProjectBackend: vi.fn(),
  mockPublicBrokCodeBackendMetadata: vi.fn(),
  mockResolveBrokCodeRequestAuth: vi.fn()
}))

vi.mock('@/lib/brokcode/account-guard', () => ({
  enforceBrokCodeAccountOwnership: mockEnforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth: mockResolveBrokCodeRequestAuth
}))

vi.mock('@/lib/brokcode/backend-provider', () => ({
  decryptInsForgeAdminKey: mockDecryptInsForgeAdminKey,
  publicBrokCodeBackendMetadata: mockPublicBrokCodeBackendMetadata
}))

vi.mock('@/lib/brokcode/insforge', () => ({
  fetchInsForgeBackendContext: mockFetchInsForgeBackendContext,
  formatInsForgeBackendContextForPrompt:
    mockFormatInsForgeBackendContextForPrompt
}))

vi.mock('@/lib/brokcode/project-store', () => ({
  getBrokCodeProject: mockGetBrokCodeProject,
  getBrokCodeProjectBackend: mockGetBrokCodeProjectBackend
}))

import { GET } from '../route'

const ownerAuth = {
  success: true,
  apiKey: { userId: 'user-owner' },
  workspace: { id: 'workspace-owner' }
}

const backend = {
  provider: 'insforge',
  projectUrl: 'https://example.insforge.app',
  encryptedAdminKey: 'encrypted'
}

const context = {
  projectUrl: 'https://example.insforge.app',
  database: {
    totalTables: 1,
    totalRecords: 0,
    databaseSize: '16 kB',
    tables: [
      {
        name: 'customers',
        recordCount: 0,
        columns: [
          { name: 'id', type: 'uuid', nullable: false, primaryKey: true }
        ]
      }
    ]
  },
  storageBuckets: [],
  functions: [],
  errors: []
}

function routeParams(id = 'project-1') {
  return { params: Promise.resolve({ id }) }
}

function request() {
  return new Request(
    'http://localhost/api/brokcode/projects/project-1/backend/context'
  )
}

describe('BrokCode backend context route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveBrokCodeRequestAuth.mockResolvedValue({ authResult: ownerAuth })
    mockEnforceBrokCodeAccountOwnership.mockResolvedValue(null)
    mockGetBrokCodeProject.mockResolvedValue({
      id: 'project-1',
      name: 'CRM',
      metadata: {}
    })
    mockGetBrokCodeProjectBackend.mockReturnValue(backend)
    mockDecryptInsForgeAdminKey.mockReturnValue('admin-key')
    mockPublicBrokCodeBackendMetadata.mockImplementation(value => ({
      ...value,
      encryptedAdminKey: undefined
    }))
    mockFetchInsForgeBackendContext.mockResolvedValue(context)
    mockFormatInsForgeBackendContextForPrompt.mockReturnValue(
      'Live InsForge backend context:\nTables:\n- customers: id uuid'
    )
  })

  test('returns live backend context without leaking the admin key', async () => {
    const response = await GET(request(), routeParams())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mockFetchInsForgeBackendContext).toHaveBeenCalledWith({
      projectUrl: 'https://example.insforge.app',
      adminKey: 'admin-key',
      tableLimit: 8
    })
    expect(body.context.database.tables[0].name).toBe('customers')
    expect(body.promptText).toContain('Live InsForge backend context')
    expect(body.backend.encryptedAdminKey).toBeUndefined()
  })

  test('fails closed when live context fetch throws', async () => {
    mockFetchInsForgeBackendContext.mockRejectedValue(new Error('offline'))

    const response = await GET(request(), routeParams())
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body).toMatchObject({
      code: 'insforge_context_unavailable',
      error: expect.stringContaining('could not be fetched')
    })
    expect(mockFormatInsForgeBackendContextForPrompt).not.toHaveBeenCalled()
  })

  test('fails closed when every live context endpoint is unavailable', async () => {
    mockFetchInsForgeBackendContext.mockResolvedValue({
      projectUrl: 'https://example.insforge.app',
      database: {
        totalTables: null,
        totalRecords: null,
        databaseSize: null,
        tables: []
      },
      storageBuckets: [],
      functions: [],
      errors: [
        'Database metadata failed',
        'Table listing failed',
        'Bucket listing failed',
        'Function listing failed'
      ]
    })

    const response = await GET(request(), routeParams())
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body.code).toBe('insforge_context_unavailable')
    expect(mockFormatInsForgeBackendContextForPrompt).not.toHaveBeenCalled()
  })

  test('fails closed when context formatting returns an empty prompt', async () => {
    mockFormatInsForgeBackendContextForPrompt.mockReturnValue('')

    const response = await GET(request(), routeParams())
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body.code).toBe('insforge_context_unavailable')
  })
})
