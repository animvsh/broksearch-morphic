import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const baseUrl = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000').replace(
  /\/+$/,
  ''
)
const prompt =
  process.env.SMOKE_BUILD_PROMPT ||
  'Build a compact AI support CRM for boutique clinics with customer intake, task follow-up, file attachments, and a mobile dashboard.'
const requireBrokCodeExecution =
  process.env.SMOKE_BUILD_REQUIRE_BROKCODE === 'true'
const timeoutMs = parsePositiveInt(
  process.env.SMOKE_BUILD_TIMEOUT_MS,
  180_000,
  'SMOKE_BUILD_TIMEOUT_MS'
)
const reportRoot = path.resolve(
  process.cwd(),
  process.env.SMOKE_BUILD_REPORT_DIR || '.brok-smoke/build-real'
)
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(
  0,
  8
)}`

type JsonObject = Record<string, unknown>

type ClassifiedApp = {
  appType: string
  isAiApp: boolean
  aiSubType: string | null
  confidence: number
  needs: string[]
  suggestedFrontend: string
  suggestedBackend: string
}

type UserVisiblePlan = {
  title: string
  oneLiner: string
  bullets: string[]
  designDirection: string
  audience: string
  aiFeatures: string[]
  backendSummary: string
}

type InternalPlan = {
  project_type: string
  frontend: string
  backend: string
  hosting: string
  coding_agent: string
  ai_features: string[]
  database_tables: string[]
  storage_buckets: string[]
  pages: string[]
  models: string[]
  functions: string[]
  integrations: string[]
}

type BuildPlanResponse = {
  classification: ClassifiedApp
  userPlan: UserVisiblePlan
  internalPlan: InternalPlan
}

type BrokBuildFilePreview = {
  path: string
  language?: string | null
  size: number
  preview?: string | null
}

type BrokStreamEvent =
  | { kind: 'phase'; phase: string; message: string }
  | { kind: 'progress'; phase: string; percent: number }
  | { kind: 'plan'; plan: UserVisiblePlan }
  | { kind: 'internal_plan'; internalPlan: InternalPlan }
  | {
      kind: 'brokcode_project'
      projectId: string
      previewUrl: string | null
      deploymentUrl: string | null
      fileCount: number
      source?: 'brokcode_execute' | 'degraded_fallback'
      degraded?: boolean
      message?: string
    }
  | { kind: 'files'; files: BrokBuildFilePreview[] }
  | { kind: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  | { kind: 'preview_url'; url: string | null }
  | { kind: 'opencode_session'; sessionId: string }
  | { kind: 'backend_status'; status: string }
  | { kind: 'backend_plan'; plan: JsonObject }
  | { kind: 'done'; projectId: string | null; previewUrl: string | null }
  | { kind: 'error'; message: string }

type SmokeReport = {
  status: 'passed' | 'failed'
  startedAt: string
  completedAt?: string
  baseUrl: string
  prompt: string
  requireBrokCodeExecution: boolean
  plan?: {
    title: string
    appType: string
    pages: number
    tables: number
  }
  stream?: {
    eventCount: number
    phases: string[]
    projectId?: string
    previewUrl?: string | null
    fileCount?: number
    source?: string
    degraded?: boolean
  }
  error?: string
}

class SmokeFailure extends Error {
  constructor(
    message: string,
    readonly details?: unknown
  ) {
    super(message)
    this.name = 'SmokeFailure'
  }
}

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  name: string
) {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got ${value}`)
  }
  return parsed
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SmokeFailure(`${label} must be a non-empty string.`, value)
  }
  return value
}

function requireNumber(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SmokeFailure(`${label} must be a finite number.`, value)
  }
  return value
}

function requireStringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new SmokeFailure(`${label} must be an array of strings.`, value)
  }
  return value as string[]
}

function authHeaders() {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  const cookie = process.env.SMOKE_AUTH_COOKIE || process.env.SMOKE_COOKIE
  const bearer =
    process.env.SMOKE_BUILD_BEARER_TOKEN || process.env.SMOKE_BROKCODE_API_KEY
  const xApiKey = process.env.SMOKE_BUILD_X_API_KEY

  if (cookie) headers.set('Cookie', cookie)
  if (bearer) headers.set('Authorization', `Bearer ${bearer}`)
  if (xApiKey) headers.set('x-api-key', xApiKey)

  return headers
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new SmokeFailure(
        `Timed out after ${timeoutMs}ms calling ${url}. Increase SMOKE_BUILD_TIMEOUT_MS if the real provider is still working.`
      )
    }
    if (
      error instanceof Error &&
      /ECONNREFUSED|fetch failed/i.test(error.message)
    ) {
      throw new SmokeFailure(
        `Could not reach ${baseUrl}. Start the app first, for example: ENABLE_AUTH=false bun dev`
      )
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function parseJsonResponse(response: Response, route: string) {
  const text = await response.text()
  const body = text ? tryParseJson(text) : null

  if (!response.ok) {
    throw new SmokeFailure(
      explainHttpFailure(route, response.status, body ?? text),
      body ?? text
    )
  }

  if (!isObject(body)) {
    throw new SmokeFailure(`${route} returned non-object JSON.`, text)
  }

  return body
}

function tryParseJson(text: string) {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function explainHttpFailure(route: string, status: number, body: unknown) {
  const bodyText =
    typeof body === 'string' ? body : JSON.stringify(body, null, 2)
  const lower = bodyText.toLowerCase()

  if (status === 401) {
    return [
      `${route} returned 401 authentication failure.`,
      'For a local black-box smoke, start the server with ENABLE_AUTH=false, or set SMOKE_AUTH_COOKIE to a signed-in Brok session cookie.',
      'If BrokCode execution also needs an API key, set SMOKE_BROKCODE_API_KEY or save a runtime key for the signed-in account.',
      `Response: ${bodyText}`
    ].join('\n')
  }

  if (status === 403 && lower.includes('feature')) {
    return [
      `${route} returned 403 feature access failure.`,
      'Use an account with BrokCode access, or configure ADMIN_EMAILS/APP_ALLOWED_EMAILS for the signed-in user on the running server.',
      `Response: ${bodyText}`
    ].join('\n')
  }

  if (
    status === 503 ||
    lower.includes('database') ||
    lower.includes('auth_storage_unavailable') ||
    lower.includes('econnrefused')
  ) {
    return [
      `${route} could not access required storage/auth dependencies.`,
      'Set DATABASE_URL for the running server, run migrations, and ensure Supabase/auth configuration or ENABLE_AUTH=false is intentional.',
      `Response: ${bodyText}`
    ].join('\n')
  }

  return `${route} failed with HTTP ${status}: ${bodyText}`
}

function assertPlanShape(body: JsonObject): BuildPlanResponse {
  const classification = body.classification
  const userPlan = body.userPlan
  const internalPlan = body.internalPlan

  if (!isObject(classification)) {
    throw new SmokeFailure(
      '/api/build/plan missing classification object.',
      body
    )
  }
  if (!isObject(userPlan)) {
    throw new SmokeFailure('/api/build/plan missing userPlan object.', body)
  }
  if (!isObject(internalPlan)) {
    throw new SmokeFailure('/api/build/plan missing internalPlan object.', body)
  }

  const plan: BuildPlanResponse = {
    classification: {
      appType: requireString(classification.appType, 'classification.appType'),
      isAiApp:
        typeof classification.isAiApp === 'boolean'
          ? classification.isAiApp
          : false,
      aiSubType:
        typeof classification.aiSubType === 'string'
          ? classification.aiSubType
          : null,
      confidence: requireNumber(
        classification.confidence,
        'classification.confidence'
      ),
      needs: requireStringArray(classification.needs, 'classification.needs'),
      suggestedFrontend: requireString(
        classification.suggestedFrontend,
        'classification.suggestedFrontend'
      ),
      suggestedBackend: requireString(
        classification.suggestedBackend,
        'classification.suggestedBackend'
      )
    },
    userPlan: {
      title: requireString(userPlan.title, 'userPlan.title'),
      oneLiner: requireString(userPlan.oneLiner, 'userPlan.oneLiner'),
      bullets: requireStringArray(userPlan.bullets, 'userPlan.bullets'),
      designDirection: requireString(
        userPlan.designDirection,
        'userPlan.designDirection'
      ),
      audience: requireString(userPlan.audience, 'userPlan.audience'),
      aiFeatures: requireStringArray(
        userPlan.aiFeatures,
        'userPlan.aiFeatures'
      ),
      backendSummary: requireString(
        userPlan.backendSummary,
        'userPlan.backendSummary'
      )
    },
    internalPlan: {
      project_type: requireString(
        internalPlan.project_type,
        'internalPlan.project_type'
      ),
      frontend: requireString(internalPlan.frontend, 'internalPlan.frontend'),
      backend: requireString(internalPlan.backend, 'internalPlan.backend'),
      hosting: requireString(internalPlan.hosting, 'internalPlan.hosting'),
      coding_agent: requireString(
        internalPlan.coding_agent,
        'internalPlan.coding_agent'
      ),
      ai_features: requireStringArray(
        internalPlan.ai_features,
        'internalPlan.ai_features'
      ),
      database_tables: requireStringArray(
        internalPlan.database_tables,
        'internalPlan.database_tables'
      ),
      storage_buckets: requireStringArray(
        internalPlan.storage_buckets,
        'internalPlan.storage_buckets'
      ),
      pages: requireStringArray(internalPlan.pages, 'internalPlan.pages'),
      models: requireStringArray(internalPlan.models, 'internalPlan.models'),
      functions: requireStringArray(
        internalPlan.functions,
        'internalPlan.functions'
      ),
      integrations: requireStringArray(
        internalPlan.integrations,
        'internalPlan.integrations'
      )
    }
  }

  if (plan.userPlan.bullets.length < 3) {
    throw new SmokeFailure('userPlan.bullets should include at least 3 items.')
  }
  if (plan.internalPlan.pages.length < 1) {
    throw new SmokeFailure('internalPlan.pages should include at least 1 page.')
  }
  if (plan.internalPlan.database_tables.length < 1) {
    throw new SmokeFailure(
      'internalPlan.database_tables should include at least 1 table/resource.'
    )
  }
  if (
    plan.classification.confidence <= 0 ||
    plan.classification.confidence > 1
  ) {
    throw new SmokeFailure(
      'classification.confidence should be between 0 and 1.'
    )
  }

  return plan
}

async function postPlan() {
  const response = await fetchWithTimeout(`${baseUrl}/api/build/plan`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ prompt })
  })
  const body = await parseJsonResponse(response, '/api/build/plan')
  return assertPlanShape(body)
}

async function postStream() {
  const response = await fetchWithTimeout(`${baseUrl}/api/build/stream`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      prompt,
      require_brokcode_execution: requireBrokCodeExecution
    })
  })

  if (!response.ok) {
    const text = await response.text()
    throw new SmokeFailure(
      explainHttpFailure(
        '/api/build/stream',
        response.status,
        tryParseJson(text) ?? text
      )
    )
  }
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/event-stream')) {
    throw new SmokeFailure(
      `/api/build/stream returned ${contentType || 'no content-type'} instead of text/event-stream.`
    )
  }

  return readBrokSse(response)
}

async function readBrokSse(response: Response) {
  if (!response.body) {
    throw new SmokeFailure('/api/build/stream response did not include a body.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const events: BrokStreamEvent[] = []
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split(/\n\n/)
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      const event = parseSseBlock(block)
      if (event) events.push(event)
    }
  }

  if (buffer.trim()) {
    const event = parseSseBlock(buffer)
    if (event) events.push(event)
  }

  assertStreamBehavior(events)
  return events
}

function parseSseBlock(block: string): BrokStreamEvent | null {
  const lines = block.split(/\r?\n/)
  const eventName = lines
    .find(line => line.startsWith('event:'))
    ?.slice('event:'.length)
    .trim()
  const data = lines
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice('data:'.length).trimStart())
    .join('\n')

  if (!eventName && !data) return null
  if (eventName !== 'brok') {
    throw new SmokeFailure(`Unexpected SSE event name "${eventName}".`, block)
  }
  if (!data) {
    throw new SmokeFailure('SSE brok event did not include data.', block)
  }

  const payload = tryParseJson(data)
  if (!isObject(payload) || typeof payload.kind !== 'string') {
    throw new SmokeFailure('SSE brok event payload is malformed.', data)
  }

  return payload as BrokStreamEvent
}

function assertStreamBehavior(events: BrokStreamEvent[]) {
  if (events.length < 8) {
    throw new SmokeFailure(
      `Expected a real build stream with many events; received ${events.length}.`,
      events
    )
  }

  const errors = events.filter(
    (event): event is Extract<BrokStreamEvent, { kind: 'error' }> =>
      event.kind === 'error'
  )
  if (errors.length > 0) {
    throw new SmokeFailure(
      [
        '/api/build/stream emitted an error event.',
        errors.map(error => `- ${error.message}`).join('\n'),
        providerHint(errors.map(error => error.message).join('\n'))
      ]
        .filter(Boolean)
        .join('\n')
    )
  }

  const phases = events
    .filter((event): event is Extract<BrokStreamEvent, { kind: 'phase' }> => {
      return event.kind === 'phase'
    })
    .map(event => event.phase)
  for (const requiredPhase of [
    'understanding',
    'planning_core_modules',
    'designing_backend_schema',
    'starting_opencode',
    'building_preview',
    'ready'
  ]) {
    if (!phases.includes(requiredPhase)) {
      throw new SmokeFailure(
        `Stream did not emit required phase "${requiredPhase}".`,
        phases
      )
    }
  }

  const plan = events.find(event => event.kind === 'plan')
  const internalPlan = events.find(event => event.kind === 'internal_plan')
  const backendPlan = events.find(event => event.kind === 'backend_plan')
  const project = events.find(
    (event): event is Extract<BrokStreamEvent, { kind: 'brokcode_project' }> =>
      event.kind === 'brokcode_project'
  )
  const files = events.find(
    (event): event is Extract<BrokStreamEvent, { kind: 'files' }> =>
      event.kind === 'files'
  )
  const preview = events.find(
    (event): event is Extract<BrokStreamEvent, { kind: 'preview_url' }> =>
      event.kind === 'preview_url'
  )
  const done = events.find(
    (event): event is Extract<BrokStreamEvent, { kind: 'done' }> =>
      event.kind === 'done'
  )

  if (!plan) throw new SmokeFailure('Stream did not emit a user plan event.')
  if (!internalPlan) {
    throw new SmokeFailure('Stream did not emit an internal plan event.')
  }
  if (!backendPlan) {
    throw new SmokeFailure('Stream did not emit a backend plan event.')
  }
  if (!project) {
    throw new SmokeFailure(
      [
        'Stream did not emit a brokcode_project event.',
        'This means the smoke did not prove real builder-to-BrokCode project creation.',
        'Check auth/DB/runtime env on the running server; for local proof without Postgres, start with ENABLE_AUTH=false, BROKCODE_PROJECT_STORAGE=file, BROKCODE_ALLOW_LOCAL_AUTH_FALLBACK=true, and a valid BrokCode provider/runtime key.'
      ].join('\n')
    )
  }
  if (!files || files.files.length < 3) {
    throw new SmokeFailure('Stream did not emit at least 3 generated files.')
  }
  for (const file of files.files) {
    requireString(file.path, 'files[].path')
    requireNumber(file.size, `files[${file.path}].size`)
  }
  if (!preview) {
    throw new SmokeFailure('Stream did not emit a preview_url event.')
  }
  if (!done) throw new SmokeFailure('Stream did not emit a done event.')
  if (!done.projectId) {
    throw new SmokeFailure('Done event did not include projectId.', done)
  }
  if (done.projectId !== project.projectId) {
    throw new SmokeFailure(
      `Done projectId ${done.projectId} did not match brokcode_project ${project.projectId}.`
    )
  }
  if (project.fileCount < 3) {
    throw new SmokeFailure(
      `BrokCode project reported only ${project.fileCount} files; expected at least 3.`
    )
  }
  if (project.degraded || project.source === 'degraded_fallback') {
    throw new SmokeFailure(
      [
        'BrokCode project was created through degraded fallback instead of real execution.',
        project.message ? `Message: ${project.message}` : null,
        'Configure the BrokCode provider/runtime env and rerun. With SMOKE_BUILD_REQUIRE_BROKCODE=true, the server should fail before fallback.'
      ]
        .filter(Boolean)
        .join('\n')
    )
  }
  if (project.source !== 'brokcode_execute') {
    throw new SmokeFailure(
      `Expected real BrokCode execution source=brokcode_execute, got source=${project.source ?? 'missing'}.`
    )
  }
}

function providerHint(message: string) {
  const lower = message.toLowerCase()
  if (
    lower.includes('api key') ||
    lower.includes('provider') ||
    lower.includes('pi') ||
    lower.includes('opencode')
  ) {
    return [
      'Provider hint: configure the running server with a real BrokCode execution provider.',
      'Common env: OPENAI_API_KEY or BROKCODE_OPENCODE_API_KEY/Pi provider settings, plus any project DB/runtime settings required by this checkout.'
    ].join('\n')
  }
  return ''
}

async function writeReport(report: SmokeReport) {
  await mkdir(reportRoot, { recursive: true })
  const reportPath = path.join(reportRoot, `${runId}.md`)
  const lines = [
    `# Brok Build Real Smoke ${report.status.toUpperCase()}`,
    '',
    `- startedAt: ${report.startedAt}`,
    `- completedAt: ${report.completedAt ?? 'n/a'}`,
    `- baseUrl: ${report.baseUrl}`,
    `- requireBrokCodeExecution: ${report.requireBrokCodeExecution}`,
    `- prompt: ${report.prompt}`,
    '',
    '## Plan',
    report.plan
      ? [
          `- title: ${report.plan.title}`,
          `- appType: ${report.plan.appType}`,
          `- pages: ${report.plan.pages}`,
          `- tables: ${report.plan.tables}`
        ].join('\n')
      : '- not completed',
    '',
    '## Stream',
    report.stream
      ? [
          `- eventCount: ${report.stream.eventCount}`,
          `- phases: ${report.stream.phases.join(', ')}`,
          `- projectId: ${report.stream.projectId ?? 'n/a'}`,
          `- previewUrl: ${report.stream.previewUrl ?? 'n/a'}`,
          `- fileCount: ${report.stream.fileCount ?? 'n/a'}`,
          `- source: ${report.stream.source ?? 'n/a'}`,
          `- degraded: ${String(report.stream.degraded ?? false)}`
        ].join('\n')
      : '- not completed',
    '',
    '## Error',
    report.error ? `\`\`\`\n${report.error}\n\`\`\`` : '- none',
    ''
  ]

  await writeFile(reportPath, lines.join('\n'))
  return reportPath
}

function summarizeStream(
  events: BrokStreamEvent[]
): NonNullable<SmokeReport['stream']> {
  const phases = [
    ...new Set(
      events
        .filter(
          (event): event is Extract<BrokStreamEvent, { kind: 'phase' }> => {
            return event.kind === 'phase'
          }
        )
        .map(event => event.phase)
    )
  ]
  const project = events.find(
    (event): event is Extract<BrokStreamEvent, { kind: 'brokcode_project' }> =>
      event.kind === 'brokcode_project'
  )
  const done = events.find(
    (event): event is Extract<BrokStreamEvent, { kind: 'done' }> =>
      event.kind === 'done'
  )

  return {
    eventCount: events.length,
    phases,
    projectId: project?.projectId ?? done?.projectId ?? undefined,
    previewUrl: project?.previewUrl ?? done?.previewUrl ?? null,
    fileCount: project?.fileCount,
    source: project?.source,
    degraded: project?.degraded
  }
}

async function main() {
  const report: SmokeReport = {
    status: 'failed',
    startedAt: new Date().toISOString(),
    baseUrl,
    prompt,
    requireBrokCodeExecution
  }

  try {
    const plan = await postPlan()
    report.plan = {
      title: plan.userPlan.title,
      appType: plan.classification.appType,
      pages: plan.internalPlan.pages.length,
      tables: plan.internalPlan.database_tables.length
    }
    console.log(
      `build smoke plan ok title="${plan.userPlan.title}" appType=${plan.classification.appType}`
    )

    const events = await postStream()
    const streamSummary = summarizeStream(events)
    report.stream = streamSummary
    report.status = 'passed'
    console.log(
      `build smoke stream ok project=${streamSummary.projectId} files=${streamSummary.fileCount} source=${streamSummary.source ?? 'unknown'}`
    )
  } catch (error) {
    report.status = 'failed'
    report.error =
      error instanceof Error
        ? error.stack || error.message
        : JSON.stringify(error, null, 2)
  } finally {
    report.completedAt = new Date().toISOString()
    const reportPath = await writeReport(report)
    console.log(`build smoke report ${reportPath}`)
  }

  if (report.status === 'failed') {
    throw new SmokeFailure(report.error ?? 'Build smoke failed.')
  }
}

await main()
