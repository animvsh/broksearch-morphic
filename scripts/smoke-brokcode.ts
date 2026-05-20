import { execFile } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { chromium } from 'playwright'

const execFileAsync = promisify(execFile)

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const apiKey = process.env.SMOKE_BROKCODE_API_KEY || 'brok_sk_local_smoke'
const skipTui = process.env.SMOKE_BROKCODE_SKIP_TUI === 'true'
const prompt =
  process.env.SMOKE_BROKCODE_PROMPT ||
  [
    'Create a polished single-page bakery landing page.',
    'Return named files for index.html, styles.css, and app.js.',
    'Include a hero, menu cards, and a working newsletter form.'
  ].join(' ')

type SseResult = {
  runtime?: string
  model?: string
  content?: string
  preview_url?: string | null
  generated_files?: string[]
  note?: string
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

async function createProject() {
  const response = await fetch(`${baseUrl}/api/brokcode/projects`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: `Smoke Bakery ${Date.now()}`,
      description: 'Created by scripts/smoke-brokcode.ts'
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

async function executeBuild(projectId: string) {
  const response = await fetch(`${baseUrl}/api/brokcode/execute`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      command: prompt,
      model: process.env.SMOKE_BROKCODE_MODEL || 'brok-lite',
      source: 'api-smoke',
      session_id: `brokcode-smoke-${Date.now()}`,
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

  if (generatedFiles.length < 1) {
    throw new Error(
      `expected generated files, got ${JSON.stringify(generatedFiles)}`
    )
  }

  if (!result.preview_url) {
    throw new Error('BrokCode result did not include preview_url')
  }

  console.log(
    `brokcode ok execute runtime=${result.runtime} files=${generatedFiles.join(',')}`
  )

  return result as SseResult & {
    preview_url: string
    generated_files: string[]
  }
}

async function verifyFiles(projectId: string) {
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

  console.log(`brokcode ok saved files ${filePaths.join(',')}`)
}

async function verifyPreview(previewUrl: string) {
  const absolutePreviewUrl = new URL(previewUrl, baseUrl).toString()
  const response = await fetch(absolutePreviewUrl)
  const html = await response.text()

  if (!response.ok) {
    throw new Error(`preview expected 200, got ${response.status}`)
  }

  if (!/bakery|baked|menu|newsletter/i.test(html)) {
    throw new Error('preview HTML did not include expected app copy')
  }

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
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

  if (!/bakery|baked|menu|newsletter/i.test(visibleText)) {
    throw new Error(`preview text missing expected app copy; title=${title}`)
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

  console.log(`brokcode ok preview ${absolutePreviewUrl}`)
}

async function verifyDeploy(projectId: string) {
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

  await verifyPreview(deploymentUrl)
  console.log(`brokcode ok deploy ${deploymentUrl}`)
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
    '<!doctype html><html><body><h1>TUI smoke app</h1></body></html>\n',
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
  const project = await createProject()
  const result = await executeBuild(project.id)
  await verifyFiles(project.id)
  await verifyPreview(result.preview_url)
  await verifyDeploy(project.id)
  await runTuiSmoke()
  console.log('brokcode smoke ok')
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
