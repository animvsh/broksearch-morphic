import { NextRequest } from 'next/server'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const {
  mockApiKeyHasScope,
  mockEnforceBrokCodeAccountOwnership,
  mockGetBrokCodeProject,
  mockListBrokCodeProjectDeployments,
  mockListBrokCodeProjectFiles,
  mockRecordBrokCodeProjectDeployment,
  mockRequireAdminAccess,
  mockUpdateBrokCodeProjectPreview,
  mockVerifyBrokCodeRequestAuth
} = vi.hoisted(() => ({
  mockApiKeyHasScope: vi.fn(),
  mockEnforceBrokCodeAccountOwnership: vi.fn(),
  mockGetBrokCodeProject: vi.fn(),
  mockListBrokCodeProjectDeployments: vi.fn(),
  mockListBrokCodeProjectFiles: vi.fn(),
  mockRecordBrokCodeProjectDeployment: vi.fn(),
  mockRequireAdminAccess: vi.fn(),
  mockUpdateBrokCodeProjectPreview: vi.fn(),
  mockVerifyBrokCodeRequestAuth: vi.fn()
}))

vi.mock('@/lib/auth/admin', () => ({
  requireAdminAccess: mockRequireAdminAccess
}))

vi.mock('@/lib/brok/auth', () => ({
  apiKeyHasScope: mockApiKeyHasScope,
  forbiddenScopeResponse: (scope: string) =>
    Response.json(
      {
        error: {
          type: 'authorization_error',
          message: `Missing scope ${scope}.`
        }
      },
      { status: 403 }
    ),
  unauthorizedResponse: () =>
    Response.json(
      {
        error: {
          type: 'authentication_error',
          message: 'Unauthorized.'
        }
      },
      { status: 401 }
    )
}))

vi.mock('@/lib/brokcode/account-guard', () => ({
  enforceBrokCodeAccountOwnership: mockEnforceBrokCodeAccountOwnership,
  getBrokCodeBrowserSessionAuth: vi.fn(),
  verifyBrokCodeRequestAuth: mockVerifyBrokCodeRequestAuth
}))

vi.mock('@/lib/brokcode/project-store', () => ({
  createBrokCodeDeploymentFileSnapshot: vi.fn(files => files),
  getBrokCodeProject: mockGetBrokCodeProject,
  listBrokCodeProjectDeployments: mockListBrokCodeProjectDeployments,
  listBrokCodeProjectFiles: mockListBrokCodeProjectFiles,
  recordBrokCodeProjectDeployment: mockRecordBrokCodeProjectDeployment,
  updateBrokCodeProjectPreview: mockUpdateBrokCodeProjectPreview
}))

import { GET, POST } from '../route'

const ownerAuth = {
  success: true,
  isBrowserSession: false,
  apiKey: { id: 'key-1', userId: 'user-owner', scopes: ['code:write'] },
  workspace: { id: 'workspace-owner' }
}

const project = {
  id: 'project-1',
  name: 'CRM Builder',
  slug: 'crm-builder',
  username: null,
  previewUrl: null,
  deploymentUrl: null,
  metadata: {}
}

const backendPlan = {
  provider: 'insforge',
  status: 'planned',
  migrationSql: 'create table public.customers(id uuid);'
}

const htmlFile = {
  path: 'index.html',
  language: 'html',
  content:
    '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /><title>CRM Builder</title><style>body{font-family:system-ui}.hero{padding:48px}.card{border:1px solid #ddd}</style></head><body><main class="hero"><h1>CRM Builder</h1><p>Manage customers, notes, follow ups, and team tasks from a polished responsive CRM workspace with useful backend-backed states.</p><button>Add customer</button></main><script>document.querySelector("button").addEventListener("click",()=>{})</script></body></html>'
}

const insforgeAppFile = {
  path: 'app.js',
  language: 'js',
  content:
    "const NEXT_PUBLIC_INSFORGE_URL = 'https://example.insforge.app';\nconst NEXT_PUBLIC_INSFORGE_APP_KEY = 'if_public_demo';\nexport async function loadCustomers() { return fetch(`${NEXT_PUBLIC_INSFORGE_URL}/api/database/tables/customers/records?appKey=${NEXT_PUBLIC_INSFORGE_APP_KEY}`); }"
}

function request(url: string, init?: RequestInit) {
  return new NextRequest(url, {
    method: init?.method,
    body: init?.body,
    headers: {
      authorization: 'Bearer brok_sk_test',
      ...(init?.headers ?? {})
    }
  })
}

describe('BrokCode deploy route backend readiness', () => {
  const originalWebhookUrl = process.env.BROKCODE_DEPLOY_WEBHOOK_URL
  const originalRailwayToken = process.env.RAILWAY_API_TOKEN
  const originalRailwayEnvironmentId = process.env.RAILWAY_ENVIRONMENT_ID
  const originalRailwayServiceId = process.env.RAILWAY_SERVICE_ID

  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    delete process.env.BROKCODE_DEPLOY_WEBHOOK_URL
    delete process.env.RAILWAY_API_TOKEN
    delete process.env.RAILWAY_ENVIRONMENT_ID
    delete process.env.RAILWAY_SERVICE_ID
    mockVerifyBrokCodeRequestAuth.mockResolvedValue({ authResult: ownerAuth })
    mockEnforceBrokCodeAccountOwnership.mockResolvedValue(null)
    mockApiKeyHasScope.mockReturnValue(true)
    mockRequireAdminAccess.mockResolvedValue({ ok: true })
    mockGetBrokCodeProject.mockResolvedValue(project)
    mockListBrokCodeProjectFiles.mockResolvedValue([htmlFile])
    mockListBrokCodeProjectDeployments.mockResolvedValue([])
    mockUpdateBrokCodeProjectPreview.mockImplementation(
      async (input: { previewUrl: string; deploymentUrl?: string | null }) => ({
        ...project,
        previewUrl: input.previewUrl,
        deploymentUrl: input.deploymentUrl ?? null
      })
    )
    mockRecordBrokCodeProjectDeployment.mockResolvedValue({
      id: 'deployment-1',
      provider: 'managed_preview',
      status: 'deployed',
      url: 'https://brok.test/brokcode/apps/crm-builder--project-1/index.html'
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (originalWebhookUrl === undefined) {
      delete process.env.BROKCODE_DEPLOY_WEBHOOK_URL
    } else {
      process.env.BROKCODE_DEPLOY_WEBHOOK_URL = originalWebhookUrl
    }
    if (originalRailwayToken === undefined) {
      delete process.env.RAILWAY_API_TOKEN
    } else {
      process.env.RAILWAY_API_TOKEN = originalRailwayToken
    }
    if (originalRailwayEnvironmentId === undefined) {
      delete process.env.RAILWAY_ENVIRONMENT_ID
    } else {
      process.env.RAILWAY_ENVIRONMENT_ID = originalRailwayEnvironmentId
    }
    if (originalRailwayServiceId === undefined) {
      delete process.env.RAILWAY_SERVICE_ID
    } else {
      process.env.RAILWAY_SERVICE_ID = originalRailwayServiceId
    }
  })

  test('GET returns backend_not_applied when a backend plan lacks apply proof', async () => {
    mockGetBrokCodeProject.mockResolvedValue({
      ...project,
      metadata: {
        preview: { backendPlan }
      }
    })

    const response = await GET(
      request('https://brok.test/api/brokcode/deploy?projectId=project-1')
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.readiness).toMatchObject({
      ready: false,
      status: 'backend_not_applied'
    })
    expect(body.deployTargets).toMatchObject({
      managed: {
        available: true,
        strategy: 'managed_live_preview'
      },
      webhook: {
        available: false,
        strategy: 'webhook'
      },
      railway: {
        available: false,
        strategy: 'railway'
      }
    })
  })

  test('POST refuses managed deploy until planned backend resources are applied', async () => {
    mockGetBrokCodeProject.mockResolvedValue({
      ...project,
      metadata: {
        preview: { backendPlan }
      }
    })

    const response = await POST(
      request('https://brok.test/api/brokcode/deploy', {
        method: 'POST',
        body: JSON.stringify({
          project_id: 'project-1',
          source: 'api-smoke'
        })
      })
    )
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.error.message).toContain('backend plan has not been applied')
    expect(mockRecordBrokCodeProjectDeployment).not.toHaveBeenCalled()
  })

  test('POST refuses managed deploy until applied backend is rewired into the app', async () => {
    mockGetBrokCodeProject.mockResolvedValue({
      ...project,
      metadata: {
        preview: {
          backendPlan,
          backendApply: {
            provider: 'insforge',
            status: 'applied'
          }
        }
      }
    })

    const response = await POST(
      request('https://brok.test/api/brokcode/deploy', {
        method: 'POST',
        body: JSON.stringify({
          project_id: 'project-1',
          source: 'api-smoke'
        })
      })
    )
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.error.message).toContain('has not been successfully rewired')
    expect(mockRecordBrokCodeProjectDeployment).not.toHaveBeenCalled()
  })

  test('POST records a managed deploy after backend apply and rewire proof exists', async () => {
    mockGetBrokCodeProject.mockResolvedValue({
      ...project,
      metadata: {
        preview: {
          backendPlan,
          backendApply: {
            provider: 'insforge',
            status: 'applied'
          },
          backendRewire: {
            provider: 'insforge',
            status: 'rewired'
          }
        }
      }
    })
    mockListBrokCodeProjectFiles.mockResolvedValue([htmlFile, insforgeAppFile])

    const response = await POST(
      request('https://brok.test/api/brokcode/deploy', {
        method: 'POST',
        body: JSON.stringify({
          project_id: 'project-1',
          source: 'api-smoke'
        })
      })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      status: 'deployed',
      strategy: 'managed_live_preview',
      deploymentKind: 'managed_static',
      externalDeployment: false,
      deploymentUrl:
        'https://brok.test/brokcode/apps/crm-builder--project-1/index.html'
    })
    expect(mockRecordBrokCodeProjectDeployment).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        provider: 'managed_preview',
        status: 'deployed',
        metadata: expect.objectContaining({
          fileSnapshot: expect.arrayContaining([
            expect.objectContaining({
              path: 'index.html',
              content: expect.stringContaining('CRM Builder')
            })
          ])
        })
      })
    )
  })

  test('POST reports missing webhook configuration for explicit webhook deploys', async () => {
    const response = await POST(
      request('https://brok.test/api/brokcode/deploy', {
        method: 'POST',
        body: JSON.stringify({
          project_id: 'project-1',
          strategy: 'webhook',
          source: 'api-smoke'
        })
      })
    )
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.error).toMatchObject({
      type: 'configuration_error',
      message: expect.stringContaining('Webhook deployment is not configured')
    })
    expect(mockRecordBrokCodeProjectDeployment).not.toHaveBeenCalled()
  })

  test('POST sends generated project files to configured webhook deploys', async () => {
    process.env.BROKCODE_DEPLOY_WEBHOOK_URL = 'https://deploy.example/webhook'
    mockGetBrokCodeProject.mockResolvedValue({
      ...project,
      metadata: {
        preview: {
          backendPlan,
          backendApply: {
            provider: 'insforge',
            status: 'applied'
          },
          backendRewire: {
            provider: 'insforge',
            status: 'rewired'
          }
        }
      }
    })
    mockListBrokCodeProjectFiles.mockResolvedValue([htmlFile, insforgeAppFile])
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body =
          typeof init?.body === 'string'
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : {}
        expect(body).toMatchObject({
          source: 'brokcode',
          requestedByWorkspaceId: 'workspace-owner',
          projectId: 'project-1',
          project: {
            id: 'project-1',
            name: 'CRM Builder',
            slug: 'crm-builder'
          },
          managedPreview: {
            deploymentUrl:
              'https://brok.test/brokcode/apps/crm-builder--project-1/index.html',
            fileCount: 2
          },
          files: expect.arrayContaining([
            expect.objectContaining({
              path: 'index.html',
              content: expect.stringContaining('CRM Builder')
            }),
            expect.objectContaining({
              path: 'app.js',
              content: expect.stringContaining('INSFORGE_URL')
            })
          ])
        })

        return new Response(
          JSON.stringify({
            deploymentUrl: 'https://external.example/crm-builder'
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
      }
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(
      request('https://brok.test/api/brokcode/deploy', {
        method: 'POST',
        body: JSON.stringify({
          project_id: 'project-1',
          strategy: 'webhook',
          source: 'api-smoke'
        })
      })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      status: 'triggered',
      strategy: 'webhook',
      deploymentKind: 'external',
      externalDeployment: true,
      previewUrl: 'https://external.example/crm-builder'
    })
    expect(mockRecordBrokCodeProjectDeployment).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        provider: 'webhook',
        status: 'triggered',
        url: 'https://external.example/crm-builder',
        metadata: expect.objectContaining({
          strategy: 'webhook',
          fileSnapshot: expect.arrayContaining([
            expect.objectContaining({
              path: 'index.html',
              content: expect.stringContaining('CRM Builder')
            })
          ]),
          deployReadiness: expect.objectContaining({
            ready: true,
            status: 'ready'
          })
        })
      })
    )
  })

  test('POST honors explicit railway strategy even when a webhook is configured', async () => {
    process.env.BROKCODE_DEPLOY_WEBHOOK_URL = 'https://deploy.example/webhook'
    process.env.RAILWAY_API_TOKEN = 'railway-token'
    process.env.RAILWAY_ENVIRONMENT_ID = 'env-1'
    process.env.RAILWAY_SERVICE_ID = 'service-1'
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain('backboard.railway.app/graphql')
      return new Response(
        JSON.stringify({
          data: {
            serviceInstanceDeployV2: 'railway-deployment-1'
          }
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(
      request('https://brok.test/api/brokcode/deploy', {
        method: 'POST',
        body: JSON.stringify({
          project_id: 'project-1',
          strategy: 'railway',
          source: 'api-smoke'
        })
      })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      status: 'triggered',
      strategy: 'railway_graphql_v2',
      deploymentKind: 'external',
      externalDeployment: true,
      deploymentId: 'railway-deployment-1'
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mockRecordBrokCodeProjectDeployment).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        provider: 'railway',
        status: 'triggered',
        metadata: expect.objectContaining({
          strategy: 'railway_graphql_v2',
          deploymentId: 'railway-deployment-1'
        })
      })
    )
  })
})
