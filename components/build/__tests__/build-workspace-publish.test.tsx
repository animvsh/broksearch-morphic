import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { useBrokBuildStreamMock } = vi.hoisted(() => ({
  useBrokBuildStreamMock: vi.fn()
}))

const buildWorkspacePath = new URL('../build-workspace.tsx', import.meta.url)
  .pathname
const useBuildStreamPath = new URL('../use-build-stream.ts', import.meta.url)
  .pathname
const buildChatPanelPath = new URL('../build-chat-panel.tsx', import.meta.url)
  .pathname
const buildConsolePath = new URL('../build-console.tsx', import.meta.url).pathname
const buildPlanCardPath = new URL('../build-plan-card.tsx', import.meta.url)
  .pathname
const buildPreviewPanelPath = new URL(
  '../build-preview-panel.tsx',
  import.meta.url
).pathname
const buildProjectBrainPath = new URL(
  '../build-project-brain.tsx',
  import.meta.url
).pathname

let BrokBuildWorkspace: typeof import('../build-workspace').BrokBuildWorkspace

describe('BrokBuildWorkspace publish handoff', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.doMock(useBuildStreamPath, () => ({
      useBrokBuildStream: () => useBrokBuildStreamMock()
    }))
    vi.doMock(buildChatPanelPath, () => ({
      BuildChatPanel: () => null
    }))
    vi.doMock(buildConsolePath, () => ({
      BuildConsole: () => null
    }))
    vi.doMock(buildPlanCardPath, () => ({
      BuildPlanCard: () => null
    }))
    vi.doMock(buildPreviewPanelPath, () => ({
      BuildPreviewPanel: () => null
    }))
    vi.doMock(buildProjectBrainPath, () => ({
      BuildProjectBrain: () => null
    }))

    ;({ BrokBuildWorkspace } = await import(buildWorkspacePath))
    useBrokBuildStreamMock.mockReturnValue({
      state: {
        phase: 'ready',
        progress: 100,
        previewUrl: '/api/brokcode/previews/project-1',
        deploymentUrl: null,
        projectId: 'project-1',
        projectSource: 'brokcode_execute',
        projectDegraded: false,
        projectMessage: 'Built through the BrokCode execution runtime.',
        events: [],
        files: [],
        logs: [],
        backendPlan: null,
        backendStatus: null,
        errorMessage: null,
        opencodeSessionId: null
      },
      start: vi.fn(),
      stop: vi.fn(),
      sendEdit: vi.fn(),
      send: vi.fn(),
      setFiles: vi.fn()
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.doUnmock(useBuildStreamPath)
    vi.doUnmock(buildChatPanelPath)
    vi.doUnmock(buildConsolePath)
    vi.doUnmock(buildPlanCardPath)
    vi.doUnmock(buildPreviewPanelPath)
    vi.doUnmock(buildProjectBrainPath)
    vi.clearAllMocks()
  })

  it('auto-starts from the prompt without waiting for plan state', async () => {
    vi.useFakeTimers()
    const start = vi.fn()
    useBrokBuildStreamMock.mockReturnValue({
      state: {
        phase: 'idle',
        progress: 0,
        previewUrl: null,
        deploymentUrl: null,
        projectId: null,
        projectSource: null,
        projectDegraded: false,
        projectMessage: null,
        events: [],
        files: [],
        logs: [],
        backendPlan: null,
        backendStatus: null,
        errorMessage: null,
        opencodeSessionId: null
      },
      start,
      stop: vi.fn(),
      sendEdit: vi.fn(),
      send: vi.fn(),
      setFiles: vi.fn()
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'plan unavailable' }, { status: 500 }))
    )

    render(
      <BrokBuildWorkspace
        initialPrompt="Build a CRM"
        autoStart={true}
        projectName="CRM Builder"
      />
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500)
    })

    expect(start).toHaveBeenCalledWith('Build a CRM')
  })

  it('checks publish readiness before POSTing deploy', async () => {
    const fetchMock = vi.fn(
      async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1]
      ) => {
        const url = requestUrl(input)
        if (url === '/api/build/plan') {
          return jsonResponse({ error: 'plan unavailable' }, { status: 500 })
        }
        if (url.startsWith('/api/brokcode/deploy?')) {
          return jsonResponse({
            readiness: {
              ready: true,
              message: 'BrokCode app is ready to publish on its managed URL.',
              previewUrl: '/api/brokcode/previews/project-1'
            },
            previewUrl: '/api/brokcode/previews/project-1',
            deploymentUrl: null
          })
        }
        if (url === '/api/brokcode/deploy' && init?.method === 'POST') {
          return jsonResponse({
            deploymentUrl: '/brokcode/apps/project-1/',
            message: 'Published from managed app.'
          })
        }
        return jsonResponse({ error: 'unexpected request' }, { status: 500 })
      }
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <BrokBuildWorkspace
        initialPrompt="Build a CRM"
        autoStart={false}
        projectName="CRM Builder"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Publish managed' }))

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Managed app' })).toHaveAttribute(
        'href',
        '/brokcode/apps/project-1/'
      )
    })

    expect(deployFetchCalls(fetchMock)).toEqual([
      {
        method: 'GET',
        url: '/api/brokcode/deploy?projectId=project-1&source=browser'
      },
      { method: 'POST', url: '/api/brokcode/deploy' }
    ])
  })

  it('surfaces blocked readiness without POSTing deploy', async () => {
    const blockedMessage =
      'BrokCode cannot publish this project yet because it does not have a renderable index.html.'
    const fetchMock = vi.fn(
      async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1]
      ) => {
        const url = requestUrl(input)
        if (url === '/api/build/plan') {
          return jsonResponse({ error: 'plan unavailable' }, { status: 500 })
        }
        if (url.startsWith('/api/brokcode/deploy?')) {
          return jsonResponse({
            readiness: {
              ready: false,
              message: blockedMessage,
              previewUrl: '/api/brokcode/previews/project-1'
            },
            previewUrl: '/api/brokcode/previews/project-1',
            deploymentUrl: null
          })
        }
        if (url === '/api/brokcode/deploy' && init?.method === 'POST') {
          return jsonResponse(
            { error: 'publish should have been blocked before POST' },
            { status: 500 }
          )
        }
        return jsonResponse({ error: 'unexpected request' }, { status: 500 })
      }
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <BrokBuildWorkspace
        initialPrompt="Build a CRM"
        autoStart={false}
        projectName="CRM Builder"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Publish managed' }))

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Deploy blocked' })
      ).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Retry publish' })).toBeInTheDocument()
    expect(screen.getAllByText(blockedMessage).length).toBeGreaterThan(0)
    expect(deployFetchCalls(fetchMock)).toEqual([
      {
        method: 'GET',
        url: '/api/brokcode/deploy?projectId=project-1&source=browser'
      }
    ])
  })

  it('applies and rewires the backend after provisioning succeeds', async () => {
    const sendMock = vi.fn(async () => true)
    useBrokBuildStreamMock.mockReturnValue({
      state: {
        phase: 'ready',
        progress: 100,
        previewUrl: '/api/brokcode/previews/project-1',
        deploymentUrl: null,
        projectId: 'project-1',
        projectSource: 'brokcode_execute',
        projectDegraded: false,
        projectMessage: 'Built through the BrokCode execution runtime.',
        events: [],
        files: [],
        logs: [],
        backendPlan: {
          provider: 'insforge',
          status: 'planned',
          tables: [],
          storageBuckets: [],
          functions: [],
          publicEnv: [],
          privateEnv: [],
          applySteps: [],
          migrationSql: 'create table public.customers(id uuid);'
        },
        backendStatus: 'connected',
        errorMessage: null,
        opencodeSessionId: null
      },
      start: vi.fn(),
      stop: vi.fn(),
      sendEdit: vi.fn(),
      send: sendMock,
      setFiles: vi.fn()
    })
    const fetchMock = vi.fn(
      async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1]
      ) => {
        const url = requestUrl(input)
        if (url === '/api/build/plan') {
          return jsonResponse({ error: 'plan unavailable' }, { status: 500 })
        }
        if (url === '/api/brokcode/projects/insforge/provision') {
          expect(init?.method).toBe('POST')
          return jsonResponse({
            backend: { status: 'ready', health: 'online' },
            message: 'InsForge backend connected.'
          })
        }
        if (url === '/api/brokcode/projects/project-1/backend/apply') {
          expect(init?.method).toBe('POST')
          return jsonResponse({
            result: {
              provider: 'insforge',
              status: 'applied',
              steps: [{ id: 'migration', status: 'applied' }]
            }
          })
        }
        if (url === '/api/brokcode/projects/project-1/backend/context') {
          return jsonResponse({
            promptText: 'Tables: customers. Public URL: https://insforge.test'
          })
        }
        return jsonResponse({ error: 'unexpected request' }, { status: 500 })
      }
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <BrokBuildWorkspace
        initialPrompt="Build a CRM"
        autoStart={false}
        projectName="CRM Builder"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Backend' }))

    await waitFor(() => {
      expect(sendMock).toHaveBeenCalledWith(
        'Build a CRM',
        expect.stringContaining('Tables: customers'),
        { requireBrokCodeExecution: true }
      )
    })
    expect(requestUrls(fetchMock)).toEqual(
      expect.arrayContaining([
        '/api/brokcode/projects/insforge/provision',
        '/api/brokcode/projects/project-1/backend/apply',
        '/api/brokcode/projects/project-1/backend/context'
      ])
    )
  })

  it('does not run the required backend rewrite when live context fails', async () => {
    const sendMock = vi.fn(async () => true)
    useBrokBuildStreamMock.mockReturnValue({
      state: {
        phase: 'ready',
        progress: 100,
        previewUrl: '/api/brokcode/previews/project-1',
        deploymentUrl: null,
        projectId: 'project-1',
        projectSource: 'brokcode_execute',
        projectDegraded: false,
        projectMessage: 'Built through the BrokCode execution runtime.',
        events: [],
        files: [],
        logs: [],
        backendPlan: {
          provider: 'insforge',
          status: 'planned',
          tables: [],
          storageBuckets: [],
          functions: [],
          publicEnv: [],
          privateEnv: [],
          applySteps: [],
          migrationSql: 'create table public.customers(id uuid);'
        },
        backendStatus: 'connected',
        errorMessage: null,
        opencodeSessionId: null
      },
      start: vi.fn(),
      stop: vi.fn(),
      sendEdit: vi.fn(),
      send: sendMock,
      setFiles: vi.fn()
    })
    const failureMessage =
      'InsForge backend context could not be fetched. Check backend health and admin key, then retry Backend setup.'
    const fetchMock = vi.fn(
      async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1]
      ) => {
        const url = requestUrl(input)
        if (url === '/api/build/plan') {
          return jsonResponse({ error: 'plan unavailable' }, { status: 500 })
        }
        if (url === '/api/brokcode/projects/insforge/provision') {
          expect(init?.method).toBe('POST')
          return jsonResponse({
            backend: { status: 'ready', health: 'online' },
            message: 'InsForge backend connected.'
          })
        }
        if (url === '/api/brokcode/projects/project-1/backend/apply') {
          expect(init?.method).toBe('POST')
          return jsonResponse({
            result: {
              provider: 'insforge',
              status: 'applied',
              steps: [{ id: 'migration', status: 'applied' }]
            }
          })
        }
        if (url === '/api/brokcode/projects/project-1/backend/context') {
          return jsonResponse(
            {
              code: 'insforge_context_unavailable',
              error: failureMessage
            },
            { status: 502 }
          )
        }
        return jsonResponse({ error: 'unexpected request' }, { status: 500 })
      }
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <BrokBuildWorkspace
        initialPrompt="Build a CRM"
        autoStart={false}
        projectName="CRM Builder"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Backend' }))

    await waitFor(() => {
      expect(screen.getAllByText(failureMessage).length).toBeGreaterThan(0)
    })
    expect(sendMock).not.toHaveBeenCalled()
    expect(requestUrls(fetchMock)).toEqual(
      expect.arrayContaining([
        '/api/brokcode/projects/insforge/provision',
        '/api/brokcode/projects/project-1/backend/apply',
        '/api/brokcode/projects/project-1/backend/context'
      ])
    )
  })
})

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' }
  })
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function deployFetchCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .map(([input, init]) => ({
      method: init?.method ?? 'GET',
      url: requestUrl(input)
    }))
    .filter(call => call.url.startsWith('/api/brokcode/deploy'))
}

function requestUrls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(([input]) => requestUrl(input))
}
