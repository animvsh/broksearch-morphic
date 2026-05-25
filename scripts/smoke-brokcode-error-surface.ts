import { chromium, type Route } from 'playwright'

const baseUrl = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000').replace(
  /\/+$/,
  ''
)
const projectId = `error-surface-${Date.now()}`
const runtimeId = `runtime-${projectId}`
const previewPath = `/api/brokcode/previews/${projectId}/index.html`
const sessionId = `error-surface-${Date.now()}`
const projectName = 'Broken Preview Smoke'
let fixRequestIncludedContext = false

const runtimeErrorLog = {
  level: 'error',
  source: 'browser',
  message: 'Exploded in preview render',
  at: new Date().toISOString(),
  file: 'src/App.tsx',
  line: 7,
  column: 13,
  stack: 'Error: Exploded in preview render\n    at App (src/App.tsx:7:13)'
}

function json(body: unknown, init: Parameters<Route['fulfill']>[0] = {}) {
  return {
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
    ...init
  }
}

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function project() {
  return {
    id: projectId,
    name: projectName,
    slug: 'broken-preview-smoke',
    username: null,
    status: 'preview_ready',
    previewUrl: `${baseUrl}${previewPath}`,
    deploymentUrl: null,
    metadata: {
      backend: {
        provider: 'none',
        status: 'not_configured',
        capabilities: {
          database: false,
          auth: false,
          storage: false,
          functions: false,
          realtime: false
        },
        health: 'unknown',
        adminKeyConfigured: false
      }
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

function runtime() {
  return {
    id: runtimeId,
    projectId,
    workspaceId: 'error-surface-smoke',
    userId: 'error-surface-user',
    sessionId,
    versionId: 'broken-v1',
    status: 'healthy',
    appType: 'vite_react',
    packageManager: 'bun',
    workspacePath: `/tmp/${projectId}`,
    installCommand: 'bun install',
    devCommand: 'bun run dev --host 0.0.0.0',
    buildCommand: 'bun run build',
    ports: [
      { name: 'web', port: 5173, protocol: 'http', visibility: 'private' }
    ],
    logs: [runtimeErrorLog],
    health: {
      ok: true,
      checkedAt: new Date().toISOString(),
      url: `${baseUrl}${previewPath}`
    },
    metadata: {
      livePreview: {
        status: 'ready',
        runtimeId,
        proxyPath: `${baseUrl}${previewPath}`,
        hotReload: true
      }
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

function projectFiles() {
  return [
    {
      id: 'file-app',
      projectId,
      workspaceId: 'error-surface-smoke',
      path: 'src/App.tsx',
      content:
        "export function App() {\n  throw new Error('Exploded in preview render')\n}\n",
      language: 'tsx',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ]
}

async function routeErrorSurfaceSmoke(route: Route) {
  const request = route.request()
  const url = new URL(request.url())

  if (url.pathname === '/api/v1/models') {
    await route.fulfill(
      json({
        object: 'list',
        data: [{ id: 'brok-code', name: 'Brok Code', supports_code: true }]
      })
    )
    return
  }

  if (url.pathname === '/api/brokcode/key') {
    await route.fulfill(json({ key: null }))
    return
  }

  if (url.pathname === '/api/brokcode/github/status') {
    await route.fulfill(
      json({
        connected: false,
        configured: false,
        message: 'GitHub is intentionally skipped in error surface smoke.'
      })
    )
    return
  }

  if (url.pathname === '/api/brokcode/github/repo-context') {
    await route.fulfill(
      json({
        repository: null,
        remoteUrl: null,
        currentBranch: null,
        defaultBranch: 'main',
        commitSha: null
      })
    )
    return
  }

  if (url.pathname === '/api/brokcode/sessions') {
    await route.fulfill(json({ sessions: [] }))
    return
  }

  if (url.pathname === '/api/brokcode/versions') {
    await route.fulfill(json({ versions: [] }))
    return
  }

  if (url.pathname === '/api/tasks') {
    await route.fulfill(json({ tasks: [] }))
    return
  }

  if (url.pathname === '/api/brokcode/projects') {
    await route.fulfill(json({ projects: [project()] }))
    return
  }

  if (url.pathname === `/api/brokcode/projects/${projectId}/files`) {
    await route.fulfill(json({ files: projectFiles() }))
    return
  }

  if (url.pathname === `/api/brokcode/projects/${projectId}/runtime`) {
    await route.fulfill(
      json({
        runtime: runtime(),
        runtimes: [runtime()],
        fallback: {
          status: 'available',
          message: 'Managed static preview remains available.'
        }
      })
    )
    return
  }

  if (
    url.pathname === `/api/brokcode/projects/${projectId}/preview` &&
    request.method() === 'POST'
  ) {
    await route.fulfill(
      json({
        status: 'ready',
        strategy: 'managed_live_preview',
        message: 'Managed BrokCode preview is ready.',
        previewUrl: `${baseUrl}${previewPath}`,
        deploymentPreviewUrl: `${baseUrl}${previewPath}`,
        fileCount: projectFiles().length,
        project: project()
      })
    )
    return
  }

  if (url.pathname === `/api/brokcode/runtime/${runtimeId}/logs`) {
    await route.fulfill(
      json({
        diagnostics: {
          runtimeId,
          status: 'ready',
          process: {
            port: 5173,
            url: `${baseUrl}${previewPath}`,
            startedAt: new Date().toISOString()
          },
          logs: [
            {
              level: 'info',
              source: 'dev-server',
              message: 'Vite dev server ready.',
              at: new Date().toISOString()
            },
            runtimeErrorLog
          ],
          lastError: runtimeErrorLog
        },
        runtime: runtime()
      })
    )
    return
  }

  if (url.pathname === '/api/brokcode/preview/status') {
    await route.fulfill(
      json({
        ok: true,
        status: 200,
        url: url.searchParams.get('url'),
        checkedAt: new Date().toISOString(),
        message: 'Preview responded but browser error was captured.'
      })
    )
    return
  }

  if (url.pathname === '/api/brokcode/execute') {
    const body = JSON.parse(request.postData() || '{}') as {
      command?: string
      messages?: Array<{ content?: string }>
    }
    const payload = [
      body.command ?? '',
      ...(body.messages ?? []).map(message => message.content ?? '')
    ].join('\n')
    fixRequestIncludedContext =
      payload.includes('Fix the current BrokCode preview/runtime failure') &&
      payload.includes('Exploded in preview render') &&
      payload.includes('src/App.tsx:7:13')

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      body: [
        sseEvent('status', { message: 'Repairing captured preview error.' }),
        sseEvent('result', {
          runtime: 'brok',
          model: 'brok-code',
          content: 'Captured runtime error context and prepared a fix.',
          usage: null,
          generated_files: [],
          file_changes: [],
          note: 'Error surface smoke repair command received.'
        })
      ].join('')
    })
    return
  }

  if (url.pathname === previewPath) {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><body><h1>${projectName}</h1></body></html>`
    })
    return
  }

  await route.continue()
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 }
  })
  const pageErrors: string[] = []
  const consoleErrors: string[] = []

  page.on('pageerror', error => pageErrors.push(error.stack || error.message))
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await page.route('**/*', routeErrorSurfaceSmoke)

  try {
    const response = await page.goto(`${baseUrl}/brokcode`, {
      waitUntil: 'domcontentloaded'
    })
    if ((response?.status() ?? 0) >= 500) {
      throw new Error(`BrokCode page returned ${response?.status()}.`)
    }

    await page.getByTestId('brokcode-app').waitFor()
    await page.getByText('browser error captured').waitFor({ timeout: 10_000 })
    await page.getByText('src/App.tsx:7:13').waitFor({ timeout: 10_000 })
    await page
      .getByText('src/App.tsx:7:13 Exploded in preview render')
      .waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Fix this' }).click()
    await page.waitForFunction(
      () =>
        document.body.innerText.includes(
          'Captured runtime error context and prepared a fix.'
        ),
      undefined,
      { timeout: 10_000 }
    )

    if (!fixRequestIncludedContext) {
      throw new Error('Fix this did not send captured runtime error context.')
    }

    if (pageErrors.length > 0 || consoleErrors.length > 0) {
      throw new Error(
        `Browser errors: ${[...pageErrors, ...consoleErrors].join('; ')}`
      )
    }

    console.log('brokcode error surface smoke ok')
  } catch (error) {
    const bodyText = await page
      .locator('body')
      .innerText()
      .catch(() => '(body unavailable)')
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n\nBrowser errors:\n${[
        ...pageErrors,
        ...consoleErrors
      ].join('\n')}\n\nVisible page text:\n${bodyText.slice(0, 4000)}`
    )
  } finally {
    await browser.close()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
