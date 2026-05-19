import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  checkInsForgeProjectHealth,
  fetchInsForgeBackendContext,
  formatInsForgeBackendContextForPrompt,
  getSharedInsForgeRailwayConfig
} from '../insforge'

describe('InsForge project health checks', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.BROKCODE_INSFORGE_SHARED_URL
    delete process.env.BROKCODE_INSFORGE_SHARED_ADMIN_KEY
    delete process.env.BROKCODE_INSFORGE_SHARED_APP_KEY
    delete process.env.BROKCODE_INSFORGE_SHARED_DASHBOARD_URL
    delete process.env.BROKCODE_INSFORGE_SHARED_PROJECT_ID
    delete process.env.BROKCODE_INSFORGE_SHARED_REGION
  })

  it('checks the project api health endpoint and marks 2xx as online', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await checkInsForgeProjectHealth({
      projectUrl: 'https://demo.insforge.app/app',
      adminKey: 'ik_test'
    })

    expect(result).toMatchObject({
      health: 'online',
      statusCode: 200,
      checkedUrl: 'https://demo.insforge.app/api/health',
      error: null
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://demo.insforge.app/api/health',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer ik_test',
          'x-api-key': 'ik_test'
        }
      })
    )
  })

  it('does not treat a 2xx HTML fallback as a healthy InsForge API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>not an api health response</html>', {
          headers: { 'content-type': 'text/html; charset=utf-8' },
          status: 200
        })
      )
    )

    await expect(
      checkInsForgeProjectHealth({ projectUrl: 'https://demo.insforge.app' })
    ).resolves.toMatchObject({
      health: 'error',
      statusCode: 200
    })
  })

  it.each([
    [401, 'auth_error'],
    [403, 'auth_error'],
    [404, 'not_found'],
    [429, 'expired_or_limited'],
    [500, 'offline']
  ] as const)('classifies HTTP %s as %s', async (status, health) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status }))
    )

    await expect(
      checkInsForgeProjectHealth({ projectUrl: 'https://demo.insforge.app' })
    ).resolves.toMatchObject({
      health,
      statusCode: status
    })
  })

  it('does not fetch invalid project URLs', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      checkInsForgeProjectHealth({ projectUrl: 'not-a-url' })
    ).resolves.toMatchObject({
      health: 'error',
      statusCode: null,
      checkedUrl: null,
      error: 'InsForge project URL is invalid.'
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads shared Railway provider config from server env', () => {
    process.env.BROKCODE_INSFORGE_SHARED_URL = 'https://insforge.brok.test'
    process.env.BROKCODE_INSFORGE_SHARED_ADMIN_KEY = 'admin-secret'
    process.env.BROKCODE_INSFORGE_SHARED_APP_KEY = 'public-app-key'
    process.env.BROKCODE_INSFORGE_SHARED_DASHBOARD_URL =
      'https://dashboard.brok.test'
    process.env.BROKCODE_INSFORGE_SHARED_PROJECT_ID = 'proj_shared'
    process.env.BROKCODE_INSFORGE_SHARED_REGION = 'us'

    expect(getSharedInsForgeRailwayConfig()).toEqual({
      projectUrl: 'https://insforge.brok.test',
      accessApiKey: 'admin-secret',
      appkey: 'public-app-key',
      dashboardUrl: 'https://dashboard.brok.test',
      projectId: 'proj_shared',
      region: 'us'
    })
  })

  it('fetches safe backend context for BrokCode prompts', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/metadata/database')) {
        return Response.json({
          totalTables: 1,
          totalRecords: 2,
          databaseSize: '24 kB',
          tables: [{ name: 'todos', recordCount: 2 }]
        })
      }
      if (url.endsWith('/api/database/tables')) {
        return Response.json(['todos'])
      }
      if (url.endsWith('/api/database/tables/todos/schema')) {
        return Response.json({
          columns: [
            {
              name: 'id',
              type: 'uuid',
              nullable: false,
              isPrimaryKey: true
            },
            {
              name: 'title',
              type: 'text',
              nullable: false,
              isPrimaryKey: false
            }
          ]
        })
      }
      if (url.endsWith('/api/storage/buckets')) {
        return Response.json({ buckets: ['uploads'] })
      }
      if (url.endsWith('/api/functions')) {
        return Response.json([
          {
            slug: 'send-email',
            name: 'Send Email',
            status: 'active',
            description: 'Sends an email'
          }
        ])
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const context = await fetchInsForgeBackendContext({
      projectUrl: 'https://demo.insforge.app',
      adminKey: 'ik_secret'
    })

    expect(context).toMatchObject({
      database: {
        totalTables: 1,
        totalRecords: 2,
        databaseSize: '24 kB',
        tables: [
          {
            name: 'todos',
            recordCount: 2,
            columns: [
              {
                name: 'id',
                type: 'uuid',
                nullable: false,
                primaryKey: true
              },
              {
                name: 'title',
                type: 'text',
                nullable: false,
                primaryKey: false
              }
            ]
          }
        ]
      },
      storageBuckets: ['uploads'],
      functions: [
        {
          slug: 'send-email',
          name: 'Send Email',
          status: 'active'
        }
      ]
    })

    expect(JSON.stringify(context)).not.toContain('ik_secret')
    expect(formatInsForgeBackendContextForPrompt(context)).toContain(
      'todos (2 records): id:uuid(pk,required), title:text(required)'
    )
  })
})
