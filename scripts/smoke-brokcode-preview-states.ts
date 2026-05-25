import { type Browser, chromium, type Route } from 'playwright'

const baseUrl = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000').replace(
  /\/+$/,
  ''
)

type PreviewStateCase = {
  id: string
  title: string
  marker: string
  previewStatus: {
    ok: boolean
    reason: string
    status?: number
    message: string
  }
  runtimeStatus?: 'healthy' | 'crashed' | 'timed_out'
  runtimeMessage?: string
}

const cases: PreviewStateCase[] = [
  {
    id: 'not-found',
    title: 'Preview route missing',
    marker: '404',
    previewStatus: {
      ok: false,
      reason: 'not_found',
      status: 404,
      message: 'Preview route returned 404.'
    }
  },
  {
    id: 'blank',
    title: 'Preview is blank',
    marker: 'Blank',
    previewStatus: {
      ok: false,
      reason: 'blank',
      status: 200,
      message: 'Preview loaded but appears blank.'
    }
  },
  {
    id: 'timeout',
    title: 'Preview timed out',
    marker: 'Timeout',
    previewStatus: {
      ok: false,
      reason: 'timeout',
      message: 'Preview server timed out.'
    }
  },
  {
    id: 'runtime-crash',
    title: 'Runtime crashed',
    marker: 'Runtime crash',
    runtimeStatus: 'crashed',
    runtimeMessage: 'Runtime exited 1.',
    previewStatus: {
      ok: true,
      reason: 'ready',
      status: 200,
      message: 'Preview server is reachable.'
    }
  }
]

function json(body: unknown, init: Parameters<Route['fulfill']>[0] = {}) {
  return {
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
    ...init
  }
}

function project(caseId: string) {
  return {
    id: `preview-state-${caseId}`,
    name: `Preview State ${caseId}`,
    slug: `preview-state-${caseId}`,
    username: null,
    status: 'preview_ready',
    previewUrl: `${baseUrl}/api/brokcode/previews/preview-state-${caseId}/index.html`,
    deploymentUrl: null,
    metadata: {
      backend: {
        provider: 'none',
        status: 'not_configured',
        health: 'unknown',
        adminKeyConfigured: false,
        capabilities: {
          database: false,
          auth: false,
          storage: false,
          functions: false,
          realtime: false
        }
      }
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

function runtime(testCase: PreviewStateCase) {
  const projectId = `preview-state-${testCase.id}`
  const runtimeId = `runtime-${projectId}`
  const status = testCase.runtimeStatus ?? 'healthy'
  return {
    id: runtimeId,
    projectId,
    workspaceId: 'preview-state-smoke',
    userId: 'preview-state-user',
    sessionId: 'preview-state-session',
    versionId: testCase.id,
    status,
    appType: 'vite_react',
    packageManager: 'bun',
    workspacePath: `/tmp/${projectId}`,
    installCommand: 'bun install',
    devCommand: 'bun run dev --host 0.0.0.0',
    buildCommand: 'bun run build',
    ports: [
      { name: 'web', port: 5173, protocol: 'http', visibility: 'private' }
    ],
    logs: [],
    health: {
      ok: status === 'healthy',
      message: testCase.runtimeMessage ?? 'Runtime is healthy.',
      checkedAt: new Date().toISOString(),
      url: `${baseUrl}/api/brokcode/previews/${projectId}/index.html`
    },
    metadata: {
      livePreview: {
        status: status === 'healthy' ? 'ready' : status,
        runtimeId,
        proxyPath: `${baseUrl}/api/brokcode/previews/${projectId}/index.html`
      }
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

async function routePreviewStateSmoke(
  testCase: PreviewStateCase,
  route: Route
) {
  const request = route.request()
  const url = new URL(request.url())
  const projectId = `preview-state-${testCase.id}`
  const runtimeId = `runtime-${projectId}`

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
        message: 'GitHub is skipped in preview-state smoke.'
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
    await route.fulfill(json({ projects: [project(testCase.id)] }))
    return
  }

  if (url.pathname === `/api/brokcode/projects/${projectId}/files`) {
    await route.fulfill(json({ files: [] }))
    return
  }

  if (url.pathname === `/api/brokcode/projects/${projectId}/runtime`) {
    await route.fulfill(
      json({
        runtime: runtime(testCase),
        runtimes: [runtime(testCase)]
      })
    )
    return
  }

  if (url.pathname === `/api/brokcode/runtime/${runtimeId}/logs`) {
    const errorLog = testCase.runtimeMessage
      ? {
          level: 'error',
          source: 'dev-server',
          message: testCase.runtimeMessage,
          at: new Date().toISOString()
        }
      : null
    await route.fulfill(
      json({
        diagnostics: {
          runtimeId,
          status: testCase.runtimeStatus ?? 'ready',
          process: null,
          logs: errorLog ? [errorLog] : [],
          lastError: errorLog
        },
        runtime: runtime(testCase)
      })
    )
    return
  }

  if (url.pathname === '/api/brokcode/preview/status') {
    await route.fulfill(
      json({
        ...testCase.previewStatus,
        url: url.searchParams.get('url'),
        checkedAt: new Date().toISOString()
      })
    )
    return
  }

  if (url.pathname === `/api/brokcode/previews/${projectId}/index.html`) {
    await route.fulfill({
      status: testCase.previewStatus.status ?? 200,
      contentType: 'text/html; charset=utf-8',
      body:
        testCase.previewStatus.reason === 'blank'
          ? '<!doctype html><html><body></body></html>'
          : `<!doctype html><html><body><h1>${projectId}</h1></body></html>`
    })
    return
  }

  await route.continue()
}

async function runCase(browser: Browser, testCase: PreviewStateCase) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 }
  })
  const page = await context.newPage()
  const pageErrors: string[] = []
  const consoleErrors: string[] = []

  page.on('pageerror', error => pageErrors.push(error.stack || error.message))
  page.on('console', message => {
    const text = message.text()
    if (
      message.type() === 'error' &&
      !/^Failed to load resource: the server responded with a status of 404/i.test(
        text
      )
    ) {
      consoleErrors.push(text)
    }
  })
  await context.route('**/*', route => routePreviewStateSmoke(testCase, route))

  try {
    await page.goto(`${baseUrl}/brokcode`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('brokcode-app').waitFor()
    const failureState = page.getByTestId('brokcode-preview-failure-state')
    await failureState.waitFor({ timeout: 20_000 })
    const failureText = await failureState.innerText()
    if (!failureText.includes(testCase.title)) {
      throw new Error(`Failure state did not include ${testCase.title}.`)
    }
    const visibleText = await page.locator('body').innerText()
    if (!visibleText.includes(testCase.marker)) {
      throw new Error(
        `Visible preview state did not include ${testCase.marker}.`
      )
    }

    if (pageErrors.length > 0 || consoleErrors.length > 0) {
      throw new Error(
        `Browser errors: ${[...pageErrors, ...consoleErrors].join('; ')}`
      )
    }
  } catch (error) {
    const bodyText = await page
      .locator('body')
      .innerText()
      .catch(() => '(body unavailable)')
    throw new Error(
      `${testCase.id}: ${error instanceof Error ? error.message : String(error)}\n\nBrowser errors:\n${[
        ...pageErrors,
        ...consoleErrors
      ].join('\n')}\n\nVisible page text:\n${bodyText.slice(0, 4000)}`
    )
  } finally {
    await context.close().catch(() => {})
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    for (const testCase of cases) {
      await runCase(browser, testCase)
      console.log(`preview state ok ${testCase.id}`)
    }
  } finally {
    await browser.close().catch(() => {})
  }
}

main()
  .then(() => {
    console.log('brokcode preview states smoke ok')
    process.exit(0)
  })
  .catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
