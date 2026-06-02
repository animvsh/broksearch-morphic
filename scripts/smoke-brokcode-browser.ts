import { chromium, type Route } from 'playwright'

const baseUrl = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000').replace(
  /\/+$/,
  ''
)
const baseOrigin = new URL(baseUrl).origin
const basePort = new URL(baseUrl).port
const prompt =
  process.env.SMOKE_BROKCODE_BROWSER_PROMPT || 'Build a polished landing page'

const projectId = crypto.randomUUID()
const sessionId = crypto.randomUUID()
const runtimeId = crypto.randomUUID()
const projectName = 'Browser Smoke Bakery'
const previewPath = `/api/brokcode/previews/${projectId}/index.html`
const deployPath = `/brokcode/apps/browser-smoke--${projectId}/index.html`
const recoveredTaskId = 'browser-smoke-task'
const includeRecoveryFlow =
  process.env.SMOKE_BROKCODE_INCLUDE_RECOVERY === 'true'

const generatedFiles = new Map<string, string>()
let recoveredTaskStatus: 'running' | 'cancelled' = 'running'
let taskEventFollowed = false
let taskCancelRequested = false

function runtime(status: 'preparing' | 'ready' | 'stopped' = 'ready') {
  return {
    id: runtimeId,
    projectId,
    workspaceId: 'browser-smoke',
    userId: 'browser-smoke-user',
    sessionId,
    versionId: null,
    status,
    appType: 'static_html',
    packageManager: 'none',
    mode: 'managed_static_preview',
    workspacePath: `/tmp/${projectId}`,
    installCommand: null,
    devCommand: 'static-preview --host 0.0.0.0',
    port: null,
    previewUrl: `${baseUrl}${previewPath}`,
    logs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

function livePreview() {
  return {
    runtimeId,
    status: 'ready',
    proxyPath: `${baseUrl}${previewPath}`,
    health: 'ready',
    checkedAt: new Date().toISOString()
  }
}

function deployReadiness() {
  return {
    status: 'ready',
    ready: true,
    fileCount: generatedFiles.size,
    previewUrl: `${baseUrl}${previewPath}`,
    deploymentUrl: `${baseUrl}${deployPath}`,
    checks: [
      {
        id: 'files',
        label: 'Generated files',
        status: 'pass',
        message: 'Browser smoke files are available.'
      },
      {
        id: 'preview',
        label: 'Preview',
        status: 'pass',
        message: 'Managed preview is reachable.'
      }
    ]
  }
}

const generatedContent = [
  'Built the browser smoke bakery app.',
  '',
  '```html filename=index.html',
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  '  <meta charset="utf-8" />',
  '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
  `  <title>${projectName}</title>`,
  '  <link rel="stylesheet" href="styles.css" />',
  '</head>',
  '<body>',
  '  <main class="shell">',
  '    <section class="hero">',
  `      <h1>${projectName}</h1>`,
  '      <p>Fresh bread, seasonal pastries, and a newsletter form that confirms signup inside the preview.</p>',
  '      <a class="button" href="#menu">View menu</a>',
  '    </section>',
  '    <section id="menu" class="cards">',
  '      <article><h2>Sourdough</h2><p>Slow-fermented loaves baked every morning.</p></article>',
  '      <article><h2>Morning buns</h2><p>Citrus, cardamom, and laminated layers.</p></article>',
  '    </section>',
  '    <form aria-label="Newsletter signup">',
  '      <label>Email <input name="email" type="email" placeholder="you@example.com" /></label>',
  '      <button type="submit">Join newsletter</button>',
  '      <p id="status" aria-live="polite"></p>',
  '    </form>',
  '  </main>',
  '  <script src="app.js"></script>',
  '</body>',
  '</html>',
  '```',
  '',
  '```css filename=styles.css',
  '* { box-sizing: border-box; }',
  'body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #f8f7f2; color: #1e1b18; }',
  '.shell { min-height: 100vh; width: min(100% - 32px, 980px); margin: 0 auto; padding: 48px 0; }',
  '.hero { padding: 64px 0 36px; }',
  'h1 { max-width: 12ch; font-size: clamp(3rem, 7vw, 5.5rem); line-height: .95; margin: 0 0 18px; }',
  'p { line-height: 1.6; color: #57524b; }',
  '.button, button { display: inline-flex; min-height: 44px; align-items: center; border: 0; border-radius: 999px; padding: 12px 18px; background: #1e1b18; color: white; text-decoration: none; font-weight: 700; }',
  '.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin: 28px 0; }',
  'article, form { border: 1px solid #ded9cf; border-radius: 12px; background: white; padding: 20px; }',
  'label { display: grid; gap: 8px; margin-bottom: 12px; }',
  'input { min-height: 42px; border: 1px solid #d8d2c8; border-radius: 10px; padding: 10px 12px; font: inherit; }',
  '```',
  '',
  '```js filename=app.js',
  "document.querySelector('form')?.addEventListener('submit', event => {",
  '  event.preventDefault();',
  "  const status = document.querySelector('#status');",
  "  if (status) status.textContent = 'Newsletter signup saved for the morning bake.';",
  '});',
  '```'
].join('\n')

function materializeGeneratedFiles() {
  generatedFiles.set(
    'index.html',
    [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="utf-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
      `  <title>${projectName}</title>`,
      '  <link rel="stylesheet" href="styles.css" />',
      '</head>',
      '<body>',
      '  <main class="shell">',
      '    <section class="hero">',
      `      <h1>${projectName}</h1>`,
      '      <p>Fresh bread, seasonal pastries, and a newsletter form that confirms signup inside the preview.</p>',
      '      <a class="button" href="#menu">View menu</a>',
      '    </section>',
      '    <section id="menu" class="cards">',
      '      <article><h2>Sourdough</h2><p>Slow-fermented loaves baked every morning.</p></article>',
      '      <article><h2>Morning buns</h2><p>Citrus, cardamom, and laminated layers.</p></article>',
      '    </section>',
      '    <form aria-label="Newsletter signup">',
      '      <label>Email <input name="email" type="email" placeholder="you@example.com" /></label>',
      '      <button type="submit">Join newsletter</button>',
      '      <p id="status" aria-live="polite"></p>',
      '    </form>',
      '  </main>',
      '  <script src="app.js"></script>',
      '</body>',
      '</html>'
    ].join('\n')
  )
  generatedFiles.set(
    'styles.css',
    [
      '* { box-sizing: border-box; }',
      'body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #f8f7f2; color: #1e1b18; }',
      '.shell { min-height: 100vh; width: min(100% - 32px, 980px); margin: 0 auto; padding: 48px 0; }',
      '.hero { padding: 64px 0 36px; }',
      'h1 { max-width: 12ch; font-size: clamp(3rem, 7vw, 5.5rem); line-height: .95; margin: 0 0 18px; }',
      'p { line-height: 1.6; color: #57524b; }',
      '.button, button { display: inline-flex; min-height: 44px; align-items: center; border: 0; padding: 12px 18px; background: #1e1b18; color: white; text-decoration: none; font-weight: 700; }',
      '.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin: 28px 0; }',
      'article, form { border: 1px solid #ded9cf; background: white; padding: 20px; }',
      'label { display: grid; gap: 8px; margin-bottom: 12px; }',
      'input { min-height: 42px; border: 1px solid #d8d2c8; padding: 10px 12px; font: inherit; }'
    ].join('\n')
  )
  generatedFiles.set(
    'app.js',
    [
      "document.querySelector('form')?.addEventListener('submit', event => {",
      '  event.preventDefault();',
      "  const status = document.querySelector('#status');",
      "  if (status) status.textContent = 'Newsletter signup saved for the morning bake.';",
      '});'
    ].join('\n')
  )
}

function serializedGeneratedFiles() {
  return [...generatedFiles.entries()].map(([path, content]) => ({
    id: `file-${path}`,
    projectId,
    workspaceId: 'browser-smoke',
    path,
    content,
    language: path.endsWith('.css')
      ? 'css'
      : path.endsWith('.js')
        ? 'js'
        : 'html',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }))
}

function generatedFileChanges() {
  return [...generatedFiles.keys()].map(path => ({
    type: 'create',
    path,
    beforeChecksum: null,
    afterChecksum: `browser-smoke-${path}`,
    summary: `Created ${path}`
  }))
}

function json(body: unknown, init: Parameters<Route['fulfill']>[0] = {}) {
  return {
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
    ...init
  }
}

function project(previewUrl?: string | null, deploymentUrl?: string | null) {
  return {
    id: projectId,
    name: projectName,
    slug: 'browser-smoke',
    username: null,
    status: deploymentUrl ? 'deployed' : previewUrl ? 'preview_ready' : 'draft',
    previewUrl: previewUrl ?? null,
    deploymentUrl: deploymentUrl ?? null,
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

function recoveredTask() {
  const now = new Date().toISOString()
  const cancelled = recoveredTaskStatus === 'cancelled'

  return {
    id: recoveredTaskId,
    kind: 'brokcode',
    title: 'Recovered browser smoke task',
    status: recoveredTaskStatus,
    metadata: {
      command: 'Recovered task from a previous browser smoke run',
      progress: cancelled ? 100 : 42,
      runtimePreference: 'brok',
      lifecycle: [
        {
          id: 'context_load',
          label: 'Context',
          detail: 'Recovered task context from the durable ledger.',
          status: 'done'
        },
        {
          id: 'generation',
          label: 'Generation',
          detail: cancelled
            ? 'Cancelled by browser smoke.'
            : 'Recoverable generation is still running.',
          status: cancelled ? 'error' : 'running'
        },
        {
          id: 'preview',
          label: 'Preview',
          detail: 'Preview waits for the recovered task result.',
          status: 'queued'
        }
      ],
      events: [
        {
          type: cancelled ? 'cancelled' : 'status',
          message: cancelled
            ? 'Cancelled by browser smoke.'
            : 'Recoverable generation is still running.',
          at: now
        }
      ]
    },
    result: {
      runtime: 'brok',
      previewUrl: cancelled ? null : `${baseUrl}${previewPath}`
    },
    error: cancelled ? 'Cancelled by browser smoke.' : null,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    completedAt: cancelled ? now : null
  }
}

function sseEvent(event: string, payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
}

function isSameLocalBrokOrigin(url: URL) {
  if (url.origin === baseOrigin) return true
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) return false
  return url.port === basePort
}

function previewHtml() {
  return (
    generatedFiles.get('index.html') ??
    '<!doctype html><html><body><h1>Browser Smoke Bakery</h1></body></html>'
  )
}

async function fulfillPreview(route: Route, pathname: string) {
  if (pathname.endsWith('/styles.css')) {
    await route.fulfill({
      status: 200,
      contentType: 'text/css; charset=utf-8',
      body: generatedFiles.get('styles.css') ?? ''
    })
    return
  }

  if (pathname.endsWith('/app.js')) {
    await route.fulfill({
      status: 200,
      contentType: 'text/javascript; charset=utf-8',
      body: generatedFiles.get('app.js') ?? ''
    })
    return
  }

  await route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: previewHtml()
  })
}

async function routeBrokCodeSmoke(route: Route) {
  const request = route.request()
  const url = new URL(request.url())

  if (!isSameLocalBrokOrigin(url)) {
    await route.continue()
    return
  }

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
        message: 'GitHub is intentionally skipped in browser smoke.'
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
    if (request.method() === 'POST') {
      await route.fulfill(
        json({
          session: {
            id: sessionId,
            title: `BrokCode ${sessionId}`,
            sources: ['cloud'],
            source: 'cloud',
            events: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        })
      )
      return
    }

    await route.fulfill(json({ sessions: [] }))
    return
  }

  if (url.pathname === '/api/brokcode/versions') {
    if (request.method() === 'POST') {
      await route.fulfill(
        json({
          version: {
            id: `version-${Date.now()}`,
            sessionId,
            command: prompt,
            summary: 'Browser smoke version snapshot.',
            runtime: 'brok',
            status: 'done',
            previewUrl: `${baseUrl}${previewPath}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        })
      )
      return
    }

    await route.fulfill(json({ versions: [] }))
    return
  }

  if (url.pathname === '/api/tasks' && request.method() === 'GET') {
    await route.fulfill(
      json({ tasks: includeRecoveryFlow ? [recoveredTask()] : [] })
    )
    return
  }

  if (
    url.pathname === `/api/tasks/${recoveredTaskId}/events` &&
    request.method() === 'GET'
  ) {
    taskEventFollowed = true
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      body: sseEvent('task.update', { task: recoveredTask() })
    })
    return
  }

  if (
    url.pathname === `/api/tasks/${recoveredTaskId}/cancel` &&
    request.method() === 'POST'
  ) {
    taskCancelRequested = true
    recoveredTaskStatus = 'cancelled'
    await route.fulfill(json({ task: recoveredTask() }))
    return
  }

  if (url.pathname === '/api/brokcode/projects') {
    if (request.method() === 'POST') {
      await route.fulfill(json({ project: project() }, { status: 201 }))
      return
    }

    await route.fulfill(json({ projects: [] }))
    return
  }

  if (url.pathname === '/api/brokcode/execute') {
    materializeGeneratedFiles()

    const body = [
      sseEvent('status', { message: 'Planning the build.' }),
      sseEvent('status', { message: 'Writing the app.' }),
      sseEvent('delta', { content: generatedContent }),
      sseEvent('result', {
        runtime: 'brok',
        model: 'brok-code',
        content: generatedContent,
        usage: null,
        preview_url: `${baseUrl}${previewPath}`,
        generated_files: ['index.html', 'styles.css', 'app.js'],
        file_changes: generatedFileChanges(),
        note: 'Browser smoke build completed.'
      })
    ].join('')

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      body
    })
    return
  }

  const fileMatch = url.pathname.match(
    /^\/api\/brokcode\/projects\/[^/]+\/files$/
  )
  if (fileMatch && request.method() === 'GET') {
    await route.fulfill(json({ files: serializedGeneratedFiles() }))
    return
  }

  if (fileMatch && request.method() === 'PUT') {
    const body = JSON.parse(request.postData() || '{}') as {
      path?: string
      content?: string
    }
    if (body.path && typeof body.content === 'string') {
      generatedFiles.set(body.path, body.content)
    }
    await route.fulfill(
      json({
        file: {
          id: `file-${body.path ?? 'unknown'}`,
          projectId,
          workspaceId: 'browser-smoke',
          path: body.path,
          content: body.content,
          language: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        files: serializedGeneratedFiles()
      })
    )
    return
  }

  if (
    url.pathname === `/api/brokcode/projects/${projectId}/runtime` &&
    request.method() === 'GET'
  ) {
    await route.fulfill(
      json({
        runtime: runtime(),
        livePreview: livePreview()
      })
    )
    return
  }

  if (
    url.pathname === `/api/brokcode/projects/${projectId}/runtime` &&
    (request.method() === 'POST' || request.method() === 'PATCH')
  ) {
    await route.fulfill(
      json({
        runtime: runtime(request.method() === 'POST' ? 'preparing' : 'ready'),
        livePreview: livePreview()
      })
    )
    return
  }

  if (
    url.pathname === `/api/brokcode/runtime/${runtimeId}/logs` &&
    request.method() === 'GET'
  ) {
    await route.fulfill(json({ runtime: runtime(), logs: [] }))
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
        fileCount: generatedFiles.size,
        project: project(`${baseUrl}${previewPath}`)
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
        message: 'Managed BrokCode preview is ready.'
      })
    )
    return
  }

  if (url.pathname === '/api/brokcode/deploy' && request.method() === 'POST') {
    await route.fulfill(
      json({
        status: 'deployed',
        strategy: 'managed_live_preview',
        message: 'BrokCode app is live on its managed URL.',
        deploymentId: `deploy-${projectId}`,
        previewUrl: `${baseUrl}${previewPath}`,
        deploymentPreviewUrl: `${baseUrl}${deployPath}`,
        deploymentUrl: `${baseUrl}${deployPath}`,
        fileCount: generatedFiles.size,
        project: project(`${baseUrl}${previewPath}`, `${baseUrl}${deployPath}`)
      })
    )
    return
  }

  if (url.pathname === '/api/brokcode/deploy' && request.method() === 'GET') {
    await route.fulfill(
      json({
        project: project(`${baseUrl}${previewPath}`, `${baseUrl}${deployPath}`),
        readiness: deployReadiness(),
        latestDeployment: null,
        deployments: [],
        previewUrl: `${baseUrl}${previewPath}`,
        deploymentUrl: `${baseUrl}${deployPath}`,
        fallback: {
          mode: 'managed_live_preview',
          enabled: true
        }
      })
    )
    return
  }

  if (
    url.pathname.startsWith(`/api/brokcode/previews/${projectId}/`) ||
    url.pathname.startsWith('/brokcode/apps/browser-smoke--')
  ) {
    await fulfillPreview(route, url.pathname)
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
  await page.context().route('**/*', routeBrokCodeSmoke)

  try {
    const response = await page.goto(`${baseUrl}/brokcode`, {
      waitUntil: 'domcontentloaded'
    })
    const finalUrl = page.url()

    if (finalUrl.includes('/auth/login')) {
      throw new Error(
        'BrokCode browser smoke reached auth login. Run the local server with ENABLE_AUTH=false or an authenticated smoke session.'
      )
    }

    if ((response?.status() ?? 0) >= 500) {
      throw new Error(`BrokCode page returned ${response?.status()}.`)
    }

    await page.getByTestId('brokcode-app').waitFor()

    const followTaskButton = page.getByRole('button', { name: 'Follow task' })
    if (
      includeRecoveryFlow &&
      (await followTaskButton.count().catch(() => 0)) > 0
    ) {
      try {
        await followTaskButton.first().waitFor({ timeout: 10_000 })
        await followTaskButton.first().click()
        await page.waitForFunction(
          () => document.body.innerText.includes('Recoverable generation'),
          undefined,
          { timeout: 10_000 }
        )
        if (!taskEventFollowed) {
          throw new Error(
            'BrokCode task recovery Follow task action was not hit.'
          )
        }
        const cancelButton = page.getByRole('button', { name: 'Cancel' })
        if (await cancelButton.count().catch(() => 0)) {
          await cancelButton.click()
          await page
            .getByText('Needs attention', { exact: true })
            .first()
            .waitFor({ timeout: 10_000 })
          await page.getByRole('button', { name: 'Retry' }).waitFor({
            timeout: 10_000
          })
          if (!taskCancelRequested) {
            throw new Error('BrokCode task recovery Cancel action was not hit.')
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown follow task error'
        console.warn(
          `Follow-task recovery flow unavailable or changed; skipping. (${message})`
        )
      }
    }

    const commandInput = page.getByTestId('brokcode-command-input')
    const commandSubmit = page.getByTestId('brokcode-command-submit')
    const quickPrompt = page.getByRole('button', { name: prompt, exact: true })
    if ((await quickPrompt.count().catch(() => 0)) > 0) {
      await quickPrompt.first().click()
    } else {
      await commandInput.fill(prompt)
    }
    await page.waitForFunction(
      () => {
        const button = document.querySelector<HTMLButtonElement>(
          '[data-testid="brokcode-command-submit"]'
        )
        return button && !button.disabled
      },
      undefined,
      { timeout: 10_000 }
    )
    await commandSubmit.click()

    await page.waitForFunction(
      () =>
        document.body.innerText.includes(
          'Files: index.html, styles.css, app.js.'
        ),
      undefined,
      { timeout: 15_000 }
    )

    const chatText = await page.locator('main > section').first().innerText()
    if (chatText.includes('<!doctype html>') || chatText.includes('```')) {
      throw new Error('Builder chat exposed raw generated source.')
    }

    const previewFrame = page.frameLocator(
      '[data-testid="brokcode-preview-frame"]'
    )
    await previewFrame.getByRole('heading', { name: projectName }).waitFor({
      timeout: 10_000
    })
    await previewFrame.getByRole('button', { name: 'Join newsletter' }).click()
    await previewFrame
      .getByText('Newsletter signup saved for the morning bake.')
      .waitFor()

    await page.getByTestId('brokcode-actions-trigger').click()
    await page.getByText('1-click deploy').click()
    await page.getByText('App is live on its managed URL.').waitFor({
      timeout: 10_000
    })
    await previewFrame.getByRole('heading', { name: projectName }).waitFor()

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(150)
    const mobileOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )

    if (overflow > 2 || mobileOverflow > 2) {
      throw new Error(
        `BrokCode browser UI overflowed: desktop=${overflow}, mobile=${mobileOverflow}`
      )
    }

    if (pageErrors.length > 0 || consoleErrors.length > 0) {
      throw new Error(
        `Browser errors: ${[...pageErrors, ...consoleErrors].join('; ')}`
      )
    }

    console.log('brokcode browser smoke ok')
  } catch (error) {
    const bodyText = await page
      .locator('body')
      .innerText()
      .catch(() => '')
    const iframeSrc = await page
      .locator('[data-testid="brokcode-preview-frame"]')
      .first()
      .getAttribute('src')
      .catch(() => null)
    const frameTexts: string[] = []
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue
      const text = await frame
        .locator('body')
        .innerText({ timeout: 1000 })
        .catch(() => '')
      frameTexts.push(`${frame.url()} :: ${text.slice(0, 500)}`)
    }
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n\nBrowser errors:\n${[
        ...pageErrors,
        ...consoleErrors
      ].join(
        '\n'
      )}\n\nPreview iframe src:\n${iframeSrc ?? 'none'}\n\nPreview frames:\n${frameTexts.join('\n') || 'none'}\n\nVisible page text:\n${bodyText.slice(0, 1200)}`
    )
  } finally {
    await browser.close()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
