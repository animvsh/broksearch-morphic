import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { chromium } from 'playwright'

import {
  buildBrokCodeAcceptanceSuiteEval,
  formatBrokCodeAcceptanceAdminReview
} from '../lib/brokcode/acceptance-eval'
import {
  BROKCODE_ACCEPTANCE_MATRIX,
  type BrokCodeAcceptanceCase,
  buildBrokCodeAcceptancePrompt,
  getBrokCodeAcceptanceCase,
  getBrokCodeAcceptanceCases,
  matchesBrokCodeAcceptanceTerms
} from '../lib/brokcode/acceptance-matrix'
import { verifyNamedCapabilities } from '../lib/brokcode/capability-checks'

const execFileAsync = promisify(execFile)

function resolveBunExecutable() {
  const explicit = process.env.BUN_EXECUTABLE || process.env.BUN_BIN
  if (explicit) return explicit

  if (process.versions.bun) return process.execPath

  const home = process.env.HOME
  const candidates = [
    home ? path.join(home, '.bun/bin/bun') : null,
    '/opt/homebrew/bin/bun',
    '/usr/local/bin/bun'
  ].filter(Boolean) as string[]

  return candidates.find(candidate => existsSync(candidate)) ?? 'bun'
}

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
let apiKey = process.env.SMOKE_BROKCODE_API_KEY || 'brok_sk_local_smoke'
const bunExecutable = resolveBunExecutable()
const skipTui = process.env.SMOKE_BROKCODE_SKIP_TUI === 'true'
const matrixMode = process.env.SMOKE_BROKCODE_MATRIX === 'true'
const noFallbackMode =
  process.env.SMOKE_BROKCODE_NO_FALLBACK === 'true' ||
  process.env.SMOKE_BROKCODE_ALLOW_FALLBACK === 'false'
const previewWaitUntil: 'domcontentloaded' | 'networkidle' =
  process.env.SMOKE_BROKCODE_PREVIEW_WAIT_UNTIL === 'networkidle'
    ? 'networkidle'
    : 'domcontentloaded'
const previewNavTimeoutMs = Number.parseInt(
  process.env.SMOKE_BROKCODE_PREVIEW_NAV_TIMEOUT_MS ?? '30000',
  10
)
if (!Number.isFinite(previewNavTimeoutMs) || previewNavTimeoutMs <= 0) {
  throw new Error(
    `SMOKE_BROKCODE_PREVIEW_NAV_TIMEOUT_MS must be a positive integer, got ${process.env.SMOKE_BROKCODE_PREVIEW_NAV_TIMEOUT_MS}`
  )
}
const anonymousUserId =
  process.env.ANONYMOUS_USER_ID || '00000000-0000-0000-0000-000000000000'
const acceptanceCase =
  getBrokCodeAcceptanceCase(process.env.SMOKE_BROKCODE_CASE) ??
  BROKCODE_ACCEPTANCE_MATRIX[0]
const prompt = process.env.SMOKE_BROKCODE_PROMPT || acceptanceCase.prompt
const smokeUserId =
  process.env.SMOKE_BROKCODE_USER_ID ||
  (process.env.ENABLE_AUTH === 'false' ? anonymousUserId : 'smoke-user')

type SseResult = {
  runtime?: string
  model?: string
  content?: string
  preview_url?: string | null
  task_id?: string | null
  status_url?: string | null
  events_url?: string | null
  generated_files?: string[]
  file_changes?: Array<{
    type?: string
    path?: string
    beforeChecksum?: string | null
    afterChecksum?: string | null
    summary?: string
  }>
  note?: string
}

type SseTaskInfo = {
  task_id?: string
  status_url?: string
  events_url?: string
}

type ProjectFile = {
  path: string
  content: string
  language?: string | null
}

type SmokeCaseReport = {
  id: string
  title: string
  category: BrokCodeAcceptanceCase['category']
  status: 'passed' | 'failed'
  checks: string[]
  runtime?: string
  model?: string
  startedAt: string
  completedAt?: string
  projectId?: string
  previewUrl?: string
  deploymentUrl?: string
  error?: string
}

type SmokeReport = {
  startedAt: string
  completedAt: string
  baseUrl: string
  matrixMode: boolean
  fallbackPolicy: 'allowed' | 'disallowed'
  cases: SmokeCaseReport[]
  tuiStatus: 'passed' | 'skipped' | 'failed' | 'not-run'
}

async function expectJson(response: Response, expectedStatus: number) {
  const body = await response.json().catch(() => null)

  if (response.status !== expectedStatus) {
    throw new Error(
      `expected ${expectedStatus}, got ${response.status}: ${JSON.stringify(body)}`
    )
  }

  return body
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchTaskResult(taskInfo: SseTaskInfo) {
  if (!taskInfo.status_url) return null

  const statusUrl = new URL(taskInfo.status_url, baseUrl).toString()
  const deadline = Date.now() + 90_000

  while (Date.now() < deadline) {
    const response = await fetch(statusUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    })
    const body = await expectJson(response, 200)
    const task = body?.task

    if (task?.status === 'succeeded') {
      const projectId = task?.metadata?.projectId
      const projectResult = task?.result ?? {}
      let project: any = null
      let files: ProjectFile[] = []

      if (typeof projectId === 'string' && projectId.length > 0) {
        const projectResponse = await fetch(
          `${baseUrl}/api/brokcode/projects/${projectId}/files`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`
            }
          }
        )
        const projectBody = await expectJson(projectResponse, 200)
        project = projectBody?.project
        files = Array.isArray(projectBody?.files) ? projectBody.files : []
      }

      const preview = project?.metadata?.preview
      const fileChanges = Array.isArray(preview?.fileChanges)
        ? preview.fileChanges
        : []
      const generatedFiles =
        Array.isArray(projectResult.generatedFiles) &&
        projectResult.generatedFiles.length > 0
          ? projectResult.generatedFiles
          : files.map(file => file.path)
      const previewUrl =
        projectResult.previewUrl ?? project?.previewUrl ?? preview?.previewUrl

      if (!previewUrl || generatedFiles.length === 0) {
        throw new Error(
          `BrokCode task succeeded without recoverable preview/files: ${JSON.stringify(task)}`
        )
      }

      return {
        runtime:
          typeof projectResult.runtime === 'string'
            ? projectResult.runtime
            : noFallbackMode
              ? 'pi'
              : undefined,
        model:
          typeof projectResult.model === 'string'
            ? projectResult.model
            : noFallbackMode
              ? 'Pi recovered task'
              : undefined,
        content: 'Recovered from completed BrokCode durable task.',
        preview_url: previewUrl,
        generated_files: generatedFiles,
        file_changes: fileChanges,
        task_id: taskInfo.task_id,
        status_url: taskInfo.status_url,
        events_url: taskInfo.events_url,
        note: 'Recovered from completed BrokCode durable task.'
      } satisfies SseResult
    }

    if (task?.status === 'failed' || task?.status === 'cancelled') {
      throw new Error(
        `BrokCode durable task ${task.status}: ${task.error ?? 'unknown error'}`
      )
    }

    await sleep(2000)
  }

  throw new Error('BrokCode durable task did not finish after stream closed.')
}

async function recoverBrokCodeResultFromProject(projectId: string) {
  const projectResponse = await fetch(
    `${baseUrl}/api/brokcode/projects/${projectId}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    }
  )
  const projectBody = await expectJson(projectResponse, 200)
  const project = projectBody?.project

  if (!project || typeof project.id !== 'string') {
    throw new Error(
      'BrokCode durable task recovery returned unexpected project payload.'
    )
  }

  const files = await fetchProjectFiles(project.id)
  if (files.length === 0) {
    throw new Error('BrokCode durable task recovery found no project files.')
  }

  const fileChangesSource = project.metadata?.preview
    ? project.metadata.preview.fileChanges
    : project.metadata?.previewResult

  return {
    runtime: noFallbackMode ? 'pi' : 'brok',
    model: noFallbackMode ? 'Pi recovered project' : 'brok-lite',
    content: 'Recovered from durable BrokCode project metadata.',
    preview_url:
      typeof project.previewUrl === 'string' ? project.previewUrl : null,
    task_id: null,
    status_url: null,
    events_url: null,
    generated_files: files.map(file => file.path),
    file_changes: Array.isArray(fileChangesSource) ? fileChangesSource : [],
    note: 'Recovered from durable BrokCode project metadata.'
  } satisfies SseResult
}

async function fetchTaskResultWithRecovery(
  taskInfo: SseTaskInfo,
  projectId?: string
) {
  const recoverProjectResult = async () => {
    if (!projectId) return null

    const deadline = Date.now() + 90_000
    while (Date.now() < deadline) {
      try {
        return await recoverBrokCodeResultFromProject(projectId)
      } catch (error) {
        if (Date.now() >= deadline) throw error
        await sleep(1000)
      }
    }

    throw new Error(
      `BrokCode project recovery timed out while waiting for task completion for ${projectId}.`
    )
  }

  try {
    return await fetchTaskResult(taskInfo)
  } catch (error) {
    const status = error instanceof Error ? error.message : String(error)
    if (projectId && status.includes('expected 200, got 401:')) {
      return recoverProjectResult()
    }
    if (!projectId) throw error
    throw error
  }
}

async function seedApiKeyIfNeeded() {
  if (apiKey !== 'brok_sk_local_smoke') return

  const seedToken = process.env.SMOKE_SEED_TOKEN
  if (seedToken) {
    const response = await fetch(`${baseUrl}/api/admin/brok/smoke-seed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${seedToken}`
      },
      body: JSON.stringify({
        kind: 'stress',
        userId: smokeUserId
      })
    })

    if (response.ok) {
      const payload = await response.json()
      const mainKey = payload?.mainKey

      if (typeof mainKey !== 'string' || !mainKey) {
        throw new Error(
          'seed endpoint response did not include a stress mainKey'
        )
      }

      apiKey = mainKey
      console.log(
        'brokcode smoke seeded code-write API key from smoke-seed endpoint'
      )
      return
    }

    const body = await response.text()
    console.warn(
      `smoke-seed endpoint not usable for brokcode smoke (${response.status}): ${body}`
    )
  }

  const isLocalTarget =
    baseUrl.startsWith('http://localhost') ||
    baseUrl.startsWith('http://127.0.0.1')
  if (!isLocalTarget) {
    throw new Error(
      'BrokCode smoke key seeding requires SMOKE_SEED_TOKEN for non-local targets'
    )
  }

  await seedApiKeyLocally()
}

async function seedApiKeyLocally() {
  const [
    { ensureWorkspaceForUser },
    { db },
    { apiKeys },
    { generateApiKey, hashNewApiKey, getKeyPrefix }
  ] = await Promise.all([
    import('@/lib/actions/api-keys'),
    import('@/lib/db'),
    import('@/lib/db/schema'),
    import('@/lib/api-key')
  ])

  const rawKey = generateApiKey('test')
  const { hash: keyHash, salt: keySalt } = hashNewApiKey(rawKey)

  try {
    const workspace = await ensureWorkspaceForUser(smokeUserId)
    await db.insert(apiKeys).values({
      workspaceId: workspace.id,
      userId: smokeUserId,
      name: 'BrokCode Smoke Key',
      keyPrefix: getKeyPrefix(rawKey),
      keyHash,
      keySalt,
      environment: 'test',
      scopes: ['chat:write', 'search:write', 'code:write', 'usage:read'],
      allowedModels: [],
      rpmLimit: 60,
      dailyRequestLimit: 5000,
      monthlyBudgetCents: 0
    })

    apiKey = rawKey
    console.log('brokcode smoke created local DB code-write key fallback')
    return
  } catch (error) {
    console.warn(
      `smoke DB seed unavailable, using Supabase REST fallback: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }

  const [
    { ensureWorkspaceForUserViaSupabaseRest },
    { createApiKeyViaSupabaseRest }
  ] = await Promise.all([
    import('./supabase-rest-seed'),
    import('./supabase-rest-seed')
  ])

  try {
    const workspace = await ensureWorkspaceForUserViaSupabaseRest(smokeUserId)
    await createApiKeyViaSupabaseRest({
      workspace_id: workspace.id,
      user_id: smokeUserId,
      name: 'BrokCode Smoke Key',
      key_prefix: getKeyPrefix(rawKey),
      key_hash: keyHash,
      key_salt: keySalt,
      environment: 'test',
      scopes: ['chat:write', 'search:write', 'code:write', 'usage:read'],
      allowed_models: [],
      rpm_limit: 60,
      daily_request_limit: 5000,
      monthly_budget_cents: 0
    })

    apiKey = rawKey
    console.log('brokcode smoke created Supabase REST fallback key')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`failed to seed BrokCode smoke API key locally: ${message}`)
  }
}

async function readSseResult(response: Response, projectId?: string) {
  if (!response.body) {
    throw new Error('BrokCode execute response did not include a stream body.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let sawStatus = false
  let sawDelta = false
  let result: SseResult | null = null
  let taskInfo: SseTaskInfo | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split(/\n\n/)
    buffer = events.pop() ?? ''

    for (const eventBlock of events) {
      const event = eventBlock
        .split(/\r?\n/)
        .find(line => line.startsWith('event:'))
        ?.slice(6)
        .trim()
      const data = eventBlock
        .split(/\r?\n/)
        .find(line => line.startsWith('data:'))
        ?.slice(5)
        .trim()

      if (!event || !data) continue

      const payload = JSON.parse(data)
      if (event === 'status') sawStatus = true
      if (event === 'delta') sawDelta = true
      if (event === 'task') taskInfo = payload as SseTaskInfo
      if (event === 'error') {
        throw new Error(`BrokCode stream error: ${payload?.message ?? data}`)
      }
      if (event === 'result') {
        result = payload as SseResult
      }
    }
  }

  if (!sawStatus) throw new Error('BrokCode stream did not emit status events.')
  if (!result && taskInfo) {
    result = await fetchTaskResultWithRecovery(taskInfo, projectId)
  }
  if (!sawDelta && !taskInfo) {
    throw new Error('BrokCode stream did not emit delta events.')
  }
  if (!result) throw new Error('BrokCode stream did not emit a result event.')

  return result
}

async function createProject(testCase: BrokCodeAcceptanceCase) {
  const response = await fetch(`${baseUrl}/api/brokcode/projects`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: `Smoke ${testCase.title} ${Date.now()}`,
      description: `Created by scripts/smoke-brokcode.ts for ${testCase.id}`
    })
  })
  const body = await expectJson(response, 201)
  const project = body?.project

  if (!project?.id) {
    throw new Error(
      'BrokCode project create response did not include project.id'
    )
  }

  console.log(`brokcode ok project ${project.id}`)
  return project as { id: string; name: string; previewUrl?: string | null }
}

async function executeBuild(
  projectId: string,
  testCase: BrokCodeAcceptanceCase
) {
  const response = await fetch(`${baseUrl}/api/brokcode/execute`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      command:
        testCase.id === acceptanceCase.id && process.env.SMOKE_BROKCODE_PROMPT
          ? prompt
          : buildBrokCodeAcceptancePrompt(testCase),
      model: process.env.SMOKE_BROKCODE_MODEL || 'brok-lite',
      source: noFallbackMode ? 'browser' : 'api-smoke',
      session_id: `brokcode-smoke-${testCase.id}-${Date.now()}`,
      project_id: projectId,
      stream: true,
      prefer_pi: noFallbackMode,
      allow_brok_fallback: !noFallbackMode
    })
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`BrokCode execute failed ${response.status}: ${body}`)
  }

  const result = await readSseResult(response, projectId)
  const generatedFiles = result.generated_files ?? []
  const fileChanges = result.file_changes ?? []

  if (noFallbackMode && result.runtime === 'brok') {
    throw new Error(
      'expected a Pi or OpenCode runtime result when no-fallback smoke mode is enabled'
    )
  }

  if (generatedFiles.length < testCase.minimumGeneratedFiles) {
    throw new Error(
      `expected at least ${testCase.minimumGeneratedFiles} generated files for ${testCase.id}, got ${JSON.stringify(generatedFiles)}`
    )
  }

  if (!result.preview_url) {
    throw new Error('BrokCode result did not include preview_url')
  }

  if (fileChanges.length < 1) {
    throw new Error('BrokCode result did not include file_changes')
  }

  console.log(
    `brokcode ok execute case=${testCase.id} runtime=${result.runtime} files=${generatedFiles.join(',')} changes=${fileChanges.length}`
  )

  return result as SseResult & {
    preview_url: string
    generated_files: string[]
  }
}

async function verifyFiles(
  projectId: string,
  testCase: BrokCodeAcceptanceCase
) {
  const response = await fetch(
    `${baseUrl}/api/brokcode/projects/${projectId}/files`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    }
  )
  const body = await expectJson(response, 200)
  const files = Array.isArray(body.files) ? body.files : []
  const filePaths = files.map((file: { path?: string }) => file.path)

  for (const required of testCase.requiredFiles) {
    if (!filePaths.includes(required)) {
      throw new Error(
        `expected saved file ${required}; got ${filePaths.join(',')}`
      )
    }
  }

  if (filePaths.length < testCase.minimumGeneratedFiles) {
    throw new Error(
      `expected at least ${testCase.minimumGeneratedFiles} saved files for ${testCase.id}; got ${filePaths.join(',')}`
    )
  }

  const capabilityChecks = verifyNamedCapabilities(files, testCase)
  console.log(
    `brokcode ok saved files case=${testCase.id} ${filePaths.join(',')}`
  )
  return capabilityChecks
}

async function fetchProjectFiles(projectId: string) {
  const response = await fetch(
    `${baseUrl}/api/brokcode/projects/${projectId}/files`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    }
  )
  const body = await expectJson(response, 200)
  return (Array.isArray(body.files) ? body.files : []) as ProjectFile[]
}

function requireProjectFile(files: ProjectFile[], filePath: string) {
  const file = files.find(item => item.path === filePath)
  if (!file) throw new Error(`expected ${filePath} to exist`)
  return file
}

async function upsertProjectFile(projectId: string, file: ProjectFile) {
  const response = await fetch(
    `${baseUrl}/api/brokcode/projects/${projectId}/files`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(file)
    }
  )

  await expectJson(response, 200)
}

async function verifyTwoEditPreservation(
  projectId: string,
  testCase: BrokCodeAcceptanceCase
) {
  const initialFiles = await fetchProjectFiles(projectId)
  const initialIndex = requireProjectFile(initialFiles, 'index.html')
  const initialStyles = requireProjectFile(initialFiles, 'styles.css')
  const initialApp = requireProjectFile(initialFiles, 'app.js')

  if (!matchesBrokCodeAcceptanceTerms(initialIndex.content, testCase)) {
    throw new Error(`initial index.html lost expected ${testCase.id} terms`)
  }

  await upsertProjectFile(projectId, {
    ...initialApp,
    content: `${initialApp.content}

document.body.dataset.brokcodeSmokeEditOne = 'loyalty-copy-preserved';
`
  })

  const afterFirstEdit = await fetchProjectFiles(projectId)
  const firstIndex = requireProjectFile(afterFirstEdit, 'index.html')
  const firstApp = requireProjectFile(afterFirstEdit, 'app.js')

  if (firstIndex.content !== initialIndex.content) {
    throw new Error('first edit unexpectedly changed index.html')
  }
  if (!firstApp.content.includes('loyalty-copy-preserved')) {
    throw new Error('first edit did not persist app.js change')
  }

  await upsertProjectFile(projectId, {
    ...initialStyles,
    content: `${initialStyles.content}

.brokcode-smoke-loyalty-pill {
  display: inline-flex;
  border-radius: 999px;
  padding: 0.45rem 0.75rem;
}
`
  })

  const afterSecondEdit = await fetchProjectFiles(projectId)
  const secondIndex = requireProjectFile(afterSecondEdit, 'index.html')
  const secondApp = requireProjectFile(afterSecondEdit, 'app.js')
  const secondStyles = requireProjectFile(afterSecondEdit, 'styles.css')

  if (secondIndex.content !== initialIndex.content) {
    throw new Error('second edit did not preserve original index.html')
  }
  if (!matchesBrokCodeAcceptanceTerms(secondIndex.content, testCase)) {
    throw new Error(`second edit lost original ${testCase.id} features`)
  }
  if (!secondApp.content.includes('loyalty-copy-preserved')) {
    throw new Error('second edit lost first edit in app.js')
  }
  if (!secondStyles.content.includes('brokcode-smoke-loyalty-pill')) {
    throw new Error('second edit did not persist styles.css change')
  }

  console.log(`brokcode ok two-edit preservation case=${testCase.id}`)
}

async function verifyPreview(
  previewUrl: string,
  testCase: BrokCodeAcceptanceCase
) {
  const absolutePreviewUrl = new URL(previewUrl, baseUrl).toString()
  const response = await fetch(absolutePreviewUrl, {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  })
  const html = await response.text()

  if (!response.ok) {
    throw new Error(`preview expected 200, got ${response.status}`)
  }

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.setExtraHTTPHeaders({
    Authorization: `Bearer ${apiKey}`
  })
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(absolutePreviewUrl, {
    timeout: previewNavTimeoutMs,
    waitUntil: previewWaitUntil
  })

  const title = await page.title()
  const overflowX = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  )
  const visibleText = await page.locator('body').innerText()
  const quality = await page.evaluate(() => {
    const stylesheets = document.querySelectorAll(
      'link[rel~="stylesheet"], style'
    )
    const interactions = document.querySelectorAll(
      'button, form, input, select, textarea, a[href]'
    )
    const viewport = document.querySelector('meta[name="viewport"]')
    const text = document.body?.innerText ?? ''

    return {
      hasViewport: Boolean(viewport),
      stylesheetCount: stylesheets.length,
      interactionCount: interactions.length,
      textLength: text.trim().length,
      hasPlaceholderCopy:
        /\blorem ipsum\b|\bcoming soon\b|\bplaceholder\b|\bTODO\b/i.test(text)
    }
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(150)
  const mobileOverflowX = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  )
  await browser.close()

  if (pageErrors.length > 0) {
    throw new Error(`preview page errors: ${pageErrors.join('; ')}`)
  }

  if (overflowX > 2) {
    throw new Error(`preview has horizontal overflow ${overflowX}`)
  }

  if (mobileOverflowX > 2) {
    throw new Error(`mobile preview has horizontal overflow ${mobileOverflowX}`)
  }

  if (!matchesBrokCodeAcceptanceTerms(visibleText, testCase)) {
    throw new Error(
      `preview text missing expected ${testCase.id} copy; title=${title}`
    )
  }

  if (!quality.hasViewport) {
    throw new Error('preview missing responsive viewport meta tag')
  }

  if (quality.stylesheetCount < 1) {
    throw new Error('preview missing stylesheet or inline style')
  }

  if (quality.interactionCount < testCase.minimumInteractions) {
    throw new Error(
      `preview missing useful interactions: expected ${testCase.minimumInteractions}, got ${quality.interactionCount}`
    )
  }

  if (quality.textLength < 120 || quality.hasPlaceholderCopy) {
    throw new Error(
      `preview looks like placeholder content: ${JSON.stringify(quality)}`
    )
  }

  console.log(`brokcode ok preview case=${testCase.id} ${absolutePreviewUrl}`)
}

async function verifyDeploy(
  projectId: string,
  testCase: BrokCodeAcceptanceCase
) {
  const response = await fetch(`${baseUrl}/api/brokcode/deploy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      project_id: projectId,
      source: 'api-smoke'
    })
  })
  const body = await expectJson(response, 200)
  const deploymentUrl = body.deploymentPreviewUrl ?? body.deploymentUrl

  if (
    typeof deploymentUrl !== 'string' ||
    !deploymentUrl.includes('/brokcode/apps/')
  ) {
    throw new Error(
      `expected managed app deployment URL, got ${JSON.stringify(body)}`
    )
  }

  await verifyPreview(deploymentUrl, testCase)
  console.log(`brokcode ok deploy case=${testCase.id} ${deploymentUrl}`)
  return deploymentUrl
}

async function runTuiSmoke() {
  if (skipTui) {
    console.log('brokcode skip tui smoke')
    return 'skipped' as const
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), 'brokcode-smoke-'))
  const configPath = path.join(tempDir, 'config.json')
  const uploadPath = path.join(tempDir, 'index.html')
  await writeFile(
    uploadPath,
    [
      '<!doctype html>',
      '<html lang="en">',
      '<head><meta name="viewport" content="width=device-width, initial-scale=1"><title>TUI Smoke App</title><style>body{font-family:system-ui;margin:0;padding:40px;background:#f7f7f4;color:#181817}main{max-width:720px;margin:auto}button,input{font:inherit;padding:12px;border-radius:12px}button{background:#181817;color:#fff;border:0}</style></head>',
      '<body><main><h1>TUI smoke app</h1><p>This app verifies that BrokCode terminal uploads can publish a real preview with enough visible product copy, a responsive viewport, useful form controls, and safe generated-app deployment behavior.</p><form><label>Request <input name="request" placeholder="Add another screen"></label><button type="submit">Save request</button></form></main><script>document.querySelector("form").addEventListener("submit",event=>{event.preventDefault();event.currentTarget.querySelector("button").textContent="Saved";});</script></body>',
      '</html>\n'
    ].join(''),
    'utf8'
  )

  const tuiEnv = {
    ...process.env,
    BROK_API_KEY: apiKey,
    BROK_BASE_URL: `${baseUrl}/api/v1`,
    BROK_SYNC_URL: baseUrl,
    BROKCODE_CONFIG_PATH: configPath,
    BROK_ENABLE_LOCAL_AUTH_FALLBACK: 'true',
    BROKCODE_ALLOW_LOCAL_AUTH_FALLBACK: 'true'
  }

  async function runOnce(command: string) {
    const { stdout, stderr } = await execFileAsync(
      bunExecutable,
      ['run', 'brokcode', '--', '--once', command],
      {
        cwd: process.cwd(),
        env: tuiEnv,
        timeout: 60_000,
        maxBuffer: 1024 * 1024
      }
    )
    const output = `${stdout}\n${stderr}`.trim()
    if (/Error:|failed|unauthorized|auth_storage_unavailable/i.test(output)) {
      throw new Error(`TUI command failed (${command}): ${output}`)
    }
    return output
  }

  function stripAnsi(text: string) {
    return text.replace(/\x1b\[[0-9;]*m/g, '')
  }

  const projectOutput = await runOnce('/project new TUI Smoke App')
  const projectMatch = stripAnsi(projectOutput).match(
    /Created and selected .* \(([^)]+)\)/
  )
  const projectRef = projectMatch?.[1]?.trim()

  if (!projectRef) {
    throw new Error(
      `TUI project create output did not include a selectable project reference: ${projectOutput}`
    )
  }

  const filePutOutput = await runOnce(
    `/file put index.html ${uploadPath} --project ${projectRef}`
  )

  let filesOutput = ''
  for (let attempt = 0; attempt < 5; attempt++) {
    filesOutput = await runOnce(`/files ${projectRef}`)
    if (filesOutput.includes('index.html')) {
      break
    }
    await sleep(500)
  }

  if (!filesOutput.includes('index.html')) {
    throw new Error(
      `TUI /file put output: ${filePutOutput}\nTUI /files output: ${filesOutput}\n/project new output: ${projectOutput}\n`
    )
  }
  const previewOutput = await runOnce(`/preview ${projectRef}`)
  if (!previewOutput.includes('/api/brokcode/previews/')) {
    throw new Error(
      `TUI /preview did not print managed preview: ${previewOutput}`
    )
  }

  const deployOutput = await runOnce(`/deploy ${projectRef}`)
  if (!deployOutput.includes('/brokcode/apps/')) {
    throw new Error(
      `TUI /deploy did not print managed deploy URL: ${deployOutput}`
    )
  }

  console.log('brokcode ok tui project/file/preview/deploy sync')
  return 'passed' as const
}

async function writeSmokeReport(report: SmokeReport) {
  const safeTimestamp = report.startedAt.replace(/[:.]/g, '-')
  const reportDir = path.join(process.cwd(), '.brok-smoke', 'brokcode')
  const jsonPath = path.join(reportDir, `smoke-${safeTimestamp}.json`)
  const markdownPath = path.join(reportDir, `smoke-${safeTimestamp}.md`)
  const latestJsonPath = path.join(reportDir, 'latest.json')
  const latestMarkdownPath = path.join(reportDir, 'latest.md')
  const adminSummaryPath = path.join(reportDir, 'latest-admin-summary.md')
  const evalRecord = buildBrokCodeAcceptanceSuiteEval(report)
  const adminSummary = formatBrokCodeAcceptanceAdminReview(evalRecord)
  await mkdir(reportDir, { recursive: true })
  await writeFile(jsonPath, `${JSON.stringify(evalRecord, null, 2)}\n`, 'utf8')
  await writeFile(
    latestJsonPath,
    `${JSON.stringify(evalRecord, null, 2)}\n`,
    'utf8'
  )
  await writeFile(markdownPath, adminSummary, 'utf8')
  await writeFile(latestMarkdownPath, adminSummary, 'utf8')
  await writeFile(adminSummaryPath, adminSummary, 'utf8')
  console.log(
    `brokcode ok report ${markdownPath} score=${evalRecord.score} status=${evalRecord.status}`
  )
}

async function main() {
  console.log(`brokcode smoke base ${baseUrl}`)
  console.log(
    `brokcode smoke fallback-policy ${noFallbackMode ? 'disallowed' : 'allowed'}`
  )
  await seedApiKeyIfNeeded()
  const startedAt = new Date().toISOString()
  const reports: SmokeCaseReport[] = []
  let tuiStatus: SmokeReport['tuiStatus'] = skipTui ? 'skipped' : 'not-run'
  const cases = matrixMode
    ? getBrokCodeAcceptanceCases(
        process.env.SMOKE_BROKCODE_CASES?.split(',')
          .map(value => value.trim())
          .filter(Boolean)
      )
    : [acceptanceCase]

  let runError: Error | null = null
  try {
    for (const testCase of cases) {
      const caseReport: SmokeCaseReport = {
        id: testCase.id,
        title: testCase.title,
        category: testCase.category,
        status: 'failed',
        checks: [],
        startedAt: new Date().toISOString()
      }
      reports.push(caseReport)

      try {
        const project = await createProject(testCase)
        caseReport.projectId = project.id
        caseReport.checks.push('project-created')

        const result = await executeBuild(project.id, testCase)
        caseReport.runtime = result.runtime
        caseReport.model = result.model
        caseReport.previewUrl = result.preview_url
        caseReport.checks.push('stream-result', 'file-changes')
        if (noFallbackMode) {
          caseReport.checks.push('runtime-no-fallback')
        }

        const capabilityChecks = await verifyFiles(project.id, testCase)
        caseReport.checks.push('files-saved', ...capabilityChecks)

        await verifyPreview(result.preview_url, testCase)
        caseReport.checks.push('preview-desktop-mobile')

        await verifyTwoEditPreservation(project.id, testCase)
        caseReport.checks.push('two-edit-preservation')

        caseReport.deploymentUrl = await verifyDeploy(project.id, testCase)
        caseReport.checks.push('managed-deploy')
        caseReport.status = 'passed'
      } catch (error) {
        caseReport.error =
          error instanceof Error ? error.message : String(error)
        if (!matrixMode) {
          throw error
        }
        if (!runError) {
          runError = error instanceof Error ? error : new Error(String(error))
        }
      } finally {
        caseReport.completedAt = new Date().toISOString()
      }
    }

    if (!runError || !matrixMode) {
      try {
        tuiStatus = await runTuiSmoke()
      } catch (error) {
        tuiStatus = 'failed'
        throw error
      }
    } else if (!skipTui) {
      tuiStatus = 'not-run'
    }
  } finally {
    await writeSmokeReport({
      startedAt,
      completedAt: new Date().toISOString(),
      baseUrl,
      matrixMode,
      fallbackPolicy: noFallbackMode ? 'disallowed' : 'allowed',
      cases: reports,
      tuiStatus
    })
  }

  const failedCases = reports.filter(report => report.status === 'failed')
  if (failedCases.length > 0) {
    throw new Error(
      `BrokCode smoke failed ${failedCases.length}/${reports.length} case(s): ${failedCases
        .map(report => `${report.id}: ${report.error ?? 'failed'}`)
        .join('; ')}`
    )
  }

  console.log(
    `brokcode smoke ok cases=${cases.map(testCase => testCase.id).join(',')}`
  )
}

const invokedScript = process.argv[1] ? path.resolve(process.argv[1]) : ''
const currentScript = path.resolve(process.cwd(), 'scripts/smoke-brokcode.ts')

if (invokedScript === currentScript) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
