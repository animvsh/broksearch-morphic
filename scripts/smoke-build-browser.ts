import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, type Route } from 'playwright'

const baseUrl = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000').replace(
  /\/+$/,
  ''
)
const prompt =
  process.env.SMOKE_BUILD_BROWSER_PROMPT ||
  'Build a premium CRM with customers, notes, tasks, and a mobile dashboard'
const projectId = crypto.randomUUID()
const previewPath = `/api/brokcode/previews/${projectId}/index.html`
const deployPath = `/brokcode/apps/build-smoke--${projectId}/index.html`
const projectName = 'Builder Smoke CRM'

let planRequested = false
let streamRequested = false
let readinessChecked = false
let deployRequested = false

const userPlan = {
  title: projectName,
  oneLiner:
    'A polished CRM workspace with customer health, notes, tasks, and fast mobile review.',
  bullets: [
    'Creates customer cards',
    'Adds notes and tasks',
    'Shows customer health',
    'Publishes a managed preview'
  ],
  designDirection: 'Quiet operational CRM with dense, scannable panels.',
  audience: 'Small teams managing high-touch customer relationships.',
  aiFeatures: ['next action suggestions'],
  backendSummary: 'BrokCode managed project with CRM starter data.'
}

const internalPlan = {
  project_type: 'crm',
  frontend: 'React + Vite + Tailwind',
  backend: 'BrokCode starter state',
  hosting: 'BrokCode managed preview',
  coding_agent: 'BrokCode runtime',
  ai_features: ['next_action_suggestions'],
  database_tables: ['customers', 'notes', 'tasks'],
  storage_buckets: ['attachments'],
  pages: ['Dashboard', 'Customers', 'Tasks'],
  models: ['next_action_model'],
  functions: ['next-action-suggest'],
  integrations: ['gmail']
}

const files = [
  {
    path: 'index.html',
    language: 'html',
    size: 980,
    preview: '<main><h1>Builder Smoke CRM</h1></main>'
  },
  {
    path: 'styles.css',
    language: 'css',
    size: 420,
    preview: 'body { font-family: system-ui; }'
  },
  {
    path: 'app.js',
    language: 'js',
    size: 180,
    preview: 'document.querySelector("form")'
  }
]

function json(data: unknown, status = 200) {
  return {
    status,
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(data)
  }
}

function sseEvent(data: unknown) {
  return `event: brok\ndata: ${JSON.stringify(data)}\n\n`
}

function streamBody() {
  return [
    sseEvent({
      kind: 'phase',
      phase: 'understanding',
      message: 'Understanding the CRM workspace.'
    }),
    sseEvent({ kind: 'progress', phase: 'understanding', percent: 12 }),
    sseEvent({ kind: 'plan', plan: userPlan }),
    sseEvent({ kind: 'internal_plan', internalPlan }),
    sseEvent({
      kind: 'backend_plan',
      plan: {
        provider: 'insforge',
        status: 'planned',
        tables: [],
        storageBuckets: [],
        functions: [],
        publicEnv: [],
        privateEnv: [],
        applySteps: [],
        migrationSql: ''
      }
    }),
    sseEvent({
      kind: 'phase',
      phase: 'starting_opencode',
      message: 'Creating the managed BrokCode project.'
    }),
    sseEvent({
      kind: 'brokcode_project',
      projectId,
      previewUrl: `${baseUrl}${previewPath}`,
      deploymentUrl: null,
      fileCount: files.length,
      source: 'brokcode_execute',
      degraded: false,
      message: 'Created BrokCode project through the execution runtime.'
    }),
    sseEvent({ kind: 'files', files }),
    sseEvent({ kind: 'preview_url', url: `${baseUrl}${previewPath}` }),
    sseEvent({
      kind: 'phase',
      phase: 'building_preview',
      message: 'Starting the managed preview.'
    }),
    sseEvent({
      kind: 'phase',
      phase: 'ready',
      message: 'Preview ready.'
    }),
    sseEvent({
      kind: 'done',
      projectId,
      previewUrl: `${baseUrl}${previewPath}`
    })
  ].join('')
}

function previewHtml() {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${projectName}</title>`,
    '  <style>',
    '    * { box-sizing: border-box; }',
    '    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #f7f8fb; color: #1c2026; }',
    '    main { width: min(100% - 32px, 980px); margin: 0 auto; padding: 42px 0; }',
    '    h1 { font-size: clamp(2.2rem, 8vw, 4.5rem); line-height: 1; margin: 0 0 16px; }',
    '    section { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }',
    '    article, form { border: 1px solid #dfe3ea; border-radius: 8px; background: white; padding: 18px; }',
    '    button, input { min-height: 44px; border-radius: 8px; font: inherit; }',
    '    input { border: 1px solid #ccd2dc; padding: 10px 12px; width: 100%; }',
    '    button { border: 0; background: #1c2026; color: white; padding: 10px 14px; }',
    '  </style>',
    '</head>',
    '<body>',
    '  <main>',
    `    <h1>${projectName}</h1>`,
    '    <p>Customer pipeline, notes, tasks, and mobile-ready health signals.</p>',
    '    <section>',
    '      <article><h2>Acme Health</h2><p>High intent account with a follow-up task due today.</p></article>',
    '      <article><h2>Northstar Labs</h2><p>Needs onboarding notes and a next action.</p></article>',
    '    </section>',
    '    <form aria-label="Quick task">',
    '      <label>Task <input name="task" placeholder="Schedule a follow-up" /></label>',
    '      <button type="submit">Save task</button>',
    '      <p id="status" aria-live="polite"></p>',
    '    </form>',
    '  </main>',
    '  <script>',
    '    document.querySelector("form").addEventListener("submit", event => {',
    '      event.preventDefault();',
    '      document.querySelector("#status").textContent = "Task saved to the CRM."; ',
    '    });',
    '  </script>',
    '</body>',
    '</html>'
  ].join('\n')
}

async function routeBuildSmoke(route: Route) {
  const request = route.request()
  const url = new URL(request.url())

  if (url.pathname === '/api/build/plan' && request.method() === 'POST') {
    planRequested = true
    await route.fulfill(json({ userPlan, internalPlan }))
    return
  }

  if (url.pathname === '/api/build/stream' && request.method() === 'POST') {
    streamRequested = true
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache'
      },
      body: streamBody()
    })
    return
  }

  if (url.pathname === previewPath) {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: previewHtml()
    })
    return
  }

  if (url.pathname === '/api/brokcode/deploy' && request.method() === 'GET') {
    readinessChecked = true
    await route.fulfill(
      json({
        project: { id: projectId, name: projectName },
        readiness: {
          status: 'ready',
          ready: true,
          message: 'Managed preview is ready to publish.',
          fileCount: files.length,
          previewUrl: `${baseUrl}${previewPath}`,
          deploymentUrl: `${baseUrl}${deployPath}`,
          checks: []
        },
        deployments: [],
        previewUrl: `${baseUrl}${previewPath}`,
        deploymentUrl: `${baseUrl}${deployPath}`
      })
    )
    return
  }

  if (url.pathname === '/api/brokcode/deploy' && request.method() === 'POST') {
    deployRequested = true
    await route.fulfill(
      json({
        status: 'deployed',
        message: 'Brok-managed app published.',
        deploymentUrl: `${baseUrl}${deployPath}`,
        deploymentPreviewUrl: `${baseUrl}${deployPath}`
      })
    )
    return
  }

  if (url.pathname === deployPath) {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: previewHtml()
    })
    return
  }

  await route.fallback()
}

async function writeReport({
  status,
  checks,
  error
}: {
  status: 'passed' | 'failed'
  checks: string[]
  error?: string
}) {
  const timestamp = new Date().toISOString()
  const safeTimestamp = timestamp.replace(/[:.]/g, '-')
  const reportDir = path.join(process.cwd(), '.brok-smoke', 'build-browser')
  await mkdir(reportDir, { recursive: true })

  const report = {
    status,
    timestamp,
    baseUrl,
    projectId,
    checks,
    error: error ?? null
  }
  const jsonPath = path.join(reportDir, `smoke-${safeTimestamp}.json`)
  const markdownPath = path.join(reportDir, `smoke-${safeTimestamp}.md`)
  const latestPath = path.join(reportDir, 'latest.json')
  await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8')
  await writeFile(latestPath, JSON.stringify(report, null, 2), 'utf8')
  await writeFile(
    markdownPath,
    [
      '# Brok Build Browser Smoke',
      '',
      `- Status: ${status}`,
      `- Time: ${timestamp}`,
      `- Base URL: ${baseUrl}`,
      `- Project: ${projectId}`,
      `- Checks: ${checks.join(', ') || 'none'}`,
      error ? `- Error: ${error}` : null
    ]
      .filter(Boolean)
      .join('\n'),
    'utf8'
  )
  return { jsonPath, markdownPath }
}

async function main() {
  const checks: string[] = []
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 }
  })
  const page = await context.newPage()
  const pageErrors: string[] = []
  const consoleErrors: string[] = []

  page.on('pageerror', error => pageErrors.push(error.stack || error.message))
  page.on('console', message => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (text.includes('Failed to load initial chats')) return
    consoleErrors.push(text)
  })
  await page.context().route('**/*', routeBuildSmoke)

  try {
    const response = await page.goto(`${baseUrl}/build`, {
      waitUntil: 'domcontentloaded'
    })
    if (page.url().includes('/auth/login')) {
      throw new Error(
        'Brok Build browser smoke reached auth login. Run the local server with ENABLE_AUTH=false or an authenticated smoke session.'
      )
    }
    if ((response?.status() ?? 0) >= 500) {
      throw new Error(`Brok Build page returned ${response?.status()}.`)
    }
    await page
      .getByRole('heading', { name: 'What do you want to build?' })
      .waitFor()
    checks.push('empty-state')

    const buildPrompt = page.locator('#brok-build-prompt')
    await buildPrompt.waitFor({ state: 'visible', timeout: 10_000 })
    await buildPrompt.fill(prompt)
    await page.waitForFunction(
      () => {
        const form = document.querySelector<HTMLFormElement>(
          'form[action="/build/new"]'
        )
        const input =
          form?.querySelector<HTMLTextAreaElement>('#brok-build-prompt')
        const button = form?.querySelector<HTMLButtonElement>(
          'button[type="submit"]'
        )
        return input?.value.trim() && button && !button.disabled
      },
      undefined,
      { timeout: 10_000 }
    )
    await page
      .locator('form[action="/build/new"] button[type="submit"]')
      .click()
    await page.waitForURL(/\/build\/new\?/, { timeout: 10_000 })
    await page.getByText('Plan ready').waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: /start building/i }).click()
    checks.push('plan-to-stream')

    await page.getByText('Runtime build').waitFor({ timeout: 10_000 })

    const previewFrame = page.frameLocator('iframe[title="Brok Build preview"]')
    await previewFrame.getByRole('heading', { name: projectName }).waitFor({
      timeout: 10_000
    })
    await previewFrame.getByRole('button', { name: 'Save task' }).click()
    await previewFrame.getByText('Task saved to the CRM.').waitFor()
    checks.push('preview-interaction')

    await page.getByRole('button', { name: /check publish/i }).click()
    await page.getByText('Deploy ready').waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: /publish managed/i }).click()
    const managedAppLink = page.getByRole('link', { name: 'Managed app' })
    await managedAppLink.waitFor({
      timeout: 10_000
    })
    await page.getByText('Brok-managed app published.').waitFor({
      timeout: 10_000
    })
    const managedAppHref = await managedAppLink.getAttribute('href')
    if (!managedAppHref?.includes(deployPath)) {
      throw new Error(
        `Managed app link did not point at the deployed app: ${managedAppHref ?? 'missing href'}`
      )
    }
    const deployedPage = await context.newPage()
    try {
      const deployedResponse = await deployedPage.goto(
        new URL(managedAppHref, baseUrl).toString(),
        { waitUntil: 'domcontentloaded' }
      )
      if ((deployedResponse?.status() ?? 0) >= 400) {
        throw new Error(
          `Managed app returned ${deployedResponse?.status() ?? 'no status'}.`
        )
      }
      await deployedPage
        .getByRole('heading', { name: projectName })
        .waitFor({ timeout: 10_000 })
      await deployedPage.getByRole('button', { name: 'Save task' }).click()
      await deployedPage.getByText('Task saved to the CRM.').waitFor()
    } finally {
      await deployedPage.close()
    }
    checks.push('publish-handoff')
    checks.push('managed-app-open')

    const desktopOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(150)
    await page.getByRole('button', { name: 'Preview' }).click()
    await previewFrame.getByRole('heading', { name: projectName }).waitFor({
      timeout: 10_000
    })
    const mobileOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
    if (desktopOverflow > 2 || mobileOverflow > 2) {
      throw new Error(
        `Brok Build UI overflowed: desktop=${desktopOverflow}, mobile=${mobileOverflow}`
      )
    }
    checks.push('mobile-overflow')

    if (
      !planRequested ||
      !streamRequested ||
      !readinessChecked ||
      !deployRequested
    ) {
      throw new Error(
        `Expected all mocked endpoints to be used: plan=${planRequested} stream=${streamRequested} readiness=${readinessChecked} deploy=${deployRequested}`
      )
    }
    checks.push('api-handoff')

    if (pageErrors.length > 0 || consoleErrors.length > 0) {
      throw new Error(
        `Browser errors: ${[...pageErrors, ...consoleErrors].join('; ')}`
      )
    }

    const report = await writeReport({ status: 'passed', checks })
    console.log(
      `brok build browser smoke ok report=${path.relative(process.cwd(), report.markdownPath)}`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const bodyText = await page
      .locator('body')
      .innerText()
      .catch(() => '')
    const report = await writeReport({
      status: 'failed',
      checks,
      error: `${message}\n\nVisible body:\n${bodyText.slice(0, 4000)}`
    })
    console.error(
      `brok build browser smoke failed report=${path.relative(process.cwd(), report.markdownPath)}`
    )
    throw error
  } finally {
    await context.close()
    await browser.close()
  }
}

await main()
