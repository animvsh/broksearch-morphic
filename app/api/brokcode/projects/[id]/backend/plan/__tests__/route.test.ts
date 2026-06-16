import { beforeEach, describe, expect, test, vi } from 'vitest'

const {
  mockEnforceBrokCodeAccountOwnership,
  mockGetBrokCodeProject,
  mockResolveBrokCodeRequestAuth
} = vi.hoisted(() => ({
  mockEnforceBrokCodeAccountOwnership: vi.fn(),
  mockGetBrokCodeProject: vi.fn(),
  mockResolveBrokCodeRequestAuth: vi.fn()
}))

vi.mock('@/lib/brokcode/account-guard', () => ({
  enforceBrokCodeAccountOwnership: mockEnforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth: mockResolveBrokCodeRequestAuth
}))

vi.mock('@/lib/brokcode/project-store', () => ({
  getBrokCodeProject: mockGetBrokCodeProject
}))

import { GET } from '../route'

const ownerAuth = {
  success: true,
  apiKey: { userId: 'user-owner' },
  workspace: { id: 'workspace-owner' }
}

function routeParams(id = 'project-1') {
  return { params: Promise.resolve({ id }) }
}

function request() {
  return new Request(
    'http://localhost/api/brokcode/projects/project-1/backend/plan'
  )
}

describe('BrokCode backend plan route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveBrokCodeRequestAuth.mockResolvedValue({ authResult: ownerAuth })
    mockEnforceBrokCodeAccountOwnership.mockResolvedValue(null)
    mockGetBrokCodeProject.mockResolvedValue({
      id: 'project-1',
      metadata: {
        preview: {
          backendPlan: {
            provider: 'insforge',
            status: 'planned',
            migrationSql: 'create table public.todos (id uuid primary key);'
          }
        }
      }
    })
  })

  test('requires owner authentication', async () => {
    mockResolveBrokCodeRequestAuth.mockResolvedValue({
      authResult: {
        success: false,
        status: 401,
        error: { code: 'missing_api_key' }
      }
    })

    const response = await GET(request(), routeParams())
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('missing_api_key')
    expect(mockGetBrokCodeProject).not.toHaveBeenCalled()
  })

  test('returns the persisted migration-capable backend plan', async () => {
    const response = await GET(request(), routeParams())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mockGetBrokCodeProject).toHaveBeenCalledWith({
      id: 'project-1',
      workspaceId: 'workspace-owner',
      userId: 'user-owner'
    })
    expect(body).toMatchObject({
      projectId: 'project-1',
      backendPlan: {
        provider: 'insforge',
        status: 'planned',
        migrationSql: expect.stringContaining('create table')
      }
    })
  })

  test('returns not found when no backend plan was saved', async () => {
    mockGetBrokCodeProject.mockResolvedValue({
      id: 'project-1',
      metadata: {}
    })

    const response = await GET(request(), routeParams())
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe('Backend plan not found for this project.')
  })
})
