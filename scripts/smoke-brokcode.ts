import { execFile } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { chromium } from 'playwright'

import {
  BROKCODE_ACCEPTANCE_MATRIX,
  type BrokCodeAcceptanceCase,
  getBrokCodeAcceptanceCase,
  getBrokCodeAcceptanceCases,
  matchesBrokCodeAcceptanceTerms
} from '../lib/brokcode/acceptance-matrix'

const execFileAsync = promisify(execFile)

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const apiKey = process.env.SMOKE_BROKCODE_API_KEY || 'brok_sk_local_smoke'
const skipTui = process.env.SMOKE_BROKCODE_SKIP_TUI === 'true'
const matrixMode = process.env.SMOKE_BROKCODE_MATRIX === 'true'
const acceptanceCase =
  getBrokCodeAcceptanceCase(process.env.SMOKE_BROKCODE_CASE) ??
  BROKCODE_ACCEPTANCE_MATRIX[0]
const prompt = process.env.SMOKE_BROKCODE_PROMPT || acceptanceCase.prompt

type SseResult = {
  runtime?: string
  model?: string
  content?: string
  preview_url?: string | null
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

type ProjectFile = {
  path: string
  content: string
  language?: string | null
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

async function readSseResult(response: Response) {
  if (!response.body) {
    throw new Error('BrokCode execute response did not include a stream body.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let sawStatus = false
  let sawDelta = false
  let result: SseResult | null = null

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
      if (event === 'error') {
        throw new Error(`BrokCode stream error: ${payload?.message ?? data}`)
      }
      if (event === 'result') {
        result = payload as SseResult
      }
    }
  }

  if (!sawStatus) throw new Error('BrokCode stream did not emit status events.')
  if (!sawDelta) throw new Error('BrokCode stream did not emit delta events.')
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
          : testCase.prompt,
      model: process.env.SMOKE_BROKCODE_MODEL || 'brok-lite',
      source: 'api-smoke',
      session_id: `brokcode-smoke-${testCase.id}-${Date.now()}`,
      project_id: projectId,
      stream: true,
      prefer_pi: false,
      allow_brok_fallback: true
    })
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`BrokCode execute failed ${response.status}: ${body}`)
  }

  const result = await readSseResult(response)
  const generatedFiles = result.generated_files ?? []
  const fileChanges = result.file_changes ?? []

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

  for (const required of ['index.html']) {
    if (!filePaths.includes(required)) {
      throw new Error(
        `expected saved file ${required}; got ${filePaths.join(',')}`
      )
    }
  }

  for (const expected of ['styles.css', 'app.js']) {
    if (!filePaths.includes(expected)) {
      throw new Error(
        `expected smoke build to save ${expected}; got ${filePaths.join(',')}`
      )
    }
  }

  if (filePaths.length < testCase.minimumGeneratedFiles) {
    throw new Error(
      `expected at least ${testCase.minimumGeneratedFiles} saved files for ${testCase.id}; got ${filePaths.join(',')}`
    )
  }

  console.log(
    `brokcode ok saved files case=${testCase.id} ${filePaths.join(',')}`
  )
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

  if (!matchesBrokCodeAcceptanceTerms(html, testCase)) {
    throw new Error(
      `preview HTML did not include expected ${testCase.id} terms`
    )
  }

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.setExtraHTTPHeaders({
    Authorization: `Bearer ${apiKey}`
  })
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(absolutePreviewUrl, { waitUntil: 'networkidle' })

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

  if (quality.interactionCount < 1) {
    throw new Error('preview missing useful interaction')
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
}

async function runTuiSmoke() {
  if (skipTui) {
    console.log('brokcode skip tui smoke')
    return
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
      'bun',
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

  await runOnce('/project new TUI Smoke App')
  await runOnce(`/file put index.html ${uploadPath}`)
  const filesOutput = await runOnce('/files')
  const previewOutput = await runOnce('/preview')
  const deployOutput = await runOnce('/deploy')

  if (!filesOutput.includes('index.html')) {
    throw new Error(`TUI /files did not list uploaded file: ${filesOutput}`)
  }
  if (!previewOutput.includes('/api/brokcode/previews/')) {
    throw new Error(
      `TUI /preview did not print managed preview: ${previewOutput}`
    )
  }
  if (!deployOutput.includes('/brokcode/apps/')) {
    throw new Error(
      `TUI /deploy did not print managed deploy URL: ${deployOutput}`
    )
  }

  console.log('brokcode ok tui project/file/preview/deploy sync')
}

async function main() {
  console.log(`brokcode smoke base ${baseUrl}`)
  const cases = matrixMode
    ? getBrokCodeAcceptanceCases(
        process.env.SMOKE_BROKCODE_CASES?.split(',')
          .map(value => value.trim())
          .filter(Boolean)
      )
    : [acceptanceCase]

  for (const testCase of cases) {
    const project = await createProject(testCase)
    const result = await executeBuild(project.id, testCase)
    await verifyFiles(project.id, testCase)
    await verifyPreview(result.preview_url, testCase)
    await verifyTwoEditPreservation(project.id, testCase)
    await verifyDeploy(project.id, testCase)
  }

  await runTuiSmoke()
  console.log(
    `brokcode smoke ok cases=${cases.map(testCase => testCase.id).join(',')}`
  )
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
