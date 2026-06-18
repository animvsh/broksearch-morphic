import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

type SseEvent = {
  event: string
  data: unknown
  raw: string
}

const baseUrl = normalizeOrigin(
  process.env.SMOKE_BASE_URL ||
    process.env.BROK_SEARCH_OUTAGE_SMOKE_BASE_URL ||
    'http://127.0.0.1:3017'
)
const timeoutMs = Number(
  process.env.BROK_SEARCH_OUTAGE_SMOKE_TIMEOUT_MS || 45_000
)
const startServer =
  process.env.BROK_SEARCH_OUTAGE_SMOKE_START_SERVER !== 'false'
const serverCommand =
  process.env.BROK_SEARCH_OUTAGE_SMOKE_SERVER_COMMAND || 'start'
const query =
  process.env.BROK_SEARCH_OUTAGE_SMOKE_QUERY ||
  'Which source confirms the current Brok provider outage fallback behavior?'

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function fail(message: string): never {
  throw new Error(`[smoke:search-provider-outage] ${message}`)
}

function assert(condition: unknown, message: string) {
  if (!condition) fail(message)
}

async function sleep(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function probeServer() {
  try {
    const response = await fetch(baseUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(2_000)
    })
    return response.status < 500
  } catch {
    return false
  }
}

async function waitForServer(getStartupError?: () => string | null) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (await probeServer()) return
    const startupError = getStartupError?.()
    if (startupError) fail(startupError)
    await sleep(500)
  }

  fail(`timed out waiting for ${baseUrl}`)
}

function outageServerEnv() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    'postgres://brok:brok@127.0.0.1:5432/brok_search_outage_smoke_unavailable'

  return {
    ...process.env,
    ENABLE_AUTH: 'false',
    APP_ACCESS_GATE: 'false',
    BROK_CLOUD_DEPLOYMENT: 'false',
    DATABASE_URL: databaseUrl,
    DATABASE_RESTRICTED_URL: databaseUrl,
    BROK_SEARCH_CACHE_TTL_MS: '0',
    BROK_SEARCH_TIMEOUT_MS: '1',
    BROK_SEARCH_BATCH_SOFT_TIMEOUT_MS: '1',
    BROK_SEARCH_SYNTHESIS_TIMEOUT_MS: '1',
    MINIMAX_CODING_PLAN_API_KEY: '',
    MINIMAX_API_KEY: '',
    BROK_PROVIDER_API_KEY: '',
    OPENAI_COMPATIBLE_API_KEY: '',
    TAVILY_API_KEY: '',
    BRAVE_SEARCH_API_KEY: '',
    EXA_API_KEY: '',
    SEARCH_API: 'tavily'
  }
}

async function ensureLocalServer() {
  if (await probeServer()) {
    return { process: null, started: false }
  }

  if (!startServer) {
    fail(
      `${baseUrl} is not reachable and BROK_SEARCH_OUTAGE_SMOKE_START_SERVER=false`
    )
  }

  const parsedUrl = new URL(baseUrl)
  const port =
    parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80')
  const hostname = parsedUrl.hostname
  if (serverCommand === 'start' && !existsSync('.next/BUILD_ID')) {
    fail(
      'next start requires a production build. Run `bun run build` first, or set BROK_SEARCH_OUTAGE_SMOKE_SERVER_COMMAND=dev.'
    )
  }
  const serverLogs: string[] = []
  let startupExit: string | null = null
  const bunExecutable = process.env.BUN_EXECUTABLE || process.execPath || 'bun'
  const child = spawn(
    bunExecutable,
    ['run', serverCommand, '--hostname', hostname, '--port', port],
    {
      cwd: process.cwd(),
      env: outageServerEnv(),
      stdio: 'pipe'
    }
  )

  child.stdout.on('data', chunk => {
    serverLogs.push(String(chunk))
    if (process.env.BROK_SEARCH_OUTAGE_SMOKE_VERBOSE_SERVER === 'true') {
      process.stdout.write(chunk)
    }
  })
  child.stderr.on('data', chunk => {
    serverLogs.push(String(chunk))
    if (process.env.BROK_SEARCH_OUTAGE_SMOKE_VERBOSE_SERVER === 'true') {
      process.stderr.write(chunk)
    }
  })
  child.once('exit', (code, signal) => {
    startupExit = `local ${serverCommand} server exited before ${baseUrl} became reachable (code=${code}, signal=${signal}). Last output:\n${serverLogs
      .join('')
      .split('\n')
      .slice(-16)
      .join('\n')}`
  })

  await waitForServer(() => startupExit)
  return { process: child, started: true }
}

async function readSse(response: Response) {
  assert(response.body, 'response did not include an SSE body')

  const decoder = new TextDecoder()
  const reader = response.body!.getReader()
  let text = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
  }
  text += decoder.decode()

  return {
    text,
    events: parseSseEvents(text)
  }
}

function parseSseEvents(stream: string): SseEvent[] {
  return stream
    .split(/\n\n+/)
    .map(frame => frame.trim())
    .filter(Boolean)
    .map(frame => {
      const event =
        frame
          .split('\n')
          .find(line => line.startsWith('event:'))
          ?.slice('event:'.length)
          .trim() || 'message'
      const dataText = frame
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice('data:'.length).trim())
        .join('\n')
      let data: unknown = dataText
      if (dataText && dataText !== '[DONE]') {
        try {
          data = JSON.parse(dataText)
        } catch {
          data = dataText
        }
      }
      return { event, data, raw: frame }
    })
}

function eventText(event: SseEvent) {
  if (typeof event.data === 'string') return event.data
  return JSON.stringify(event.data)
}

async function runOutageSessionSmoke() {
  const response = await fetch(`${baseUrl}/api/search/session`, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream'
    },
    body: JSON.stringify({
      query,
      mode: 'quick',
      depth: 'lite'
    })
  })

  if (response.status !== 200) {
    fail(
      `expected HTTP 200 from /api/search/session, got ${response.status}: ${await response.text()}`
    )
  }
  assert(
    response.headers.get('content-type')?.includes('text/event-stream'),
    `expected text/event-stream response, got ${response.headers.get('content-type')}`
  )

  const { text, events } = await readSse(response)
  const answer = events
    .filter(event => event.event === 'answer_delta')
    .map(event => {
      if (
        event.data &&
        typeof event.data === 'object' &&
        'delta' in event.data
      ) {
        return String((event.data as { delta?: unknown }).delta ?? '')
      }
      return eventText(event)
    })
    .join('')

  assert(
    events.some(event => event.event === 'status'),
    'missing status event'
  )
  assert(
    events.some(event => event.event === 'query_resolved'),
    'missing query_resolved event'
  )
  assert(
    events.some(event => event.event === 'search_started'),
    'missing search_started event'
  )
  assert(
    events.some(event => event.event === 'done'),
    'missing done event; answer did not complete'
  )
  assert(text.includes('data: [DONE]'), 'missing terminal [DONE] frame')
  assert(
    answer.includes('Live web search was unavailable') &&
      answer.includes('fast local fallback') &&
      answer.includes('No web sources were attached'),
    `fallback answer was not clearly labeled. Answer: ${answer}`
  )
  assert(
    !/\[\d+\]/.test(answer) && !answer.includes('#brok-session-search:'),
    `fallback answer should not contain citation markers or citation links. Answer: ${answer}`
  )

  const sourceEvents = events.filter(event =>
    ['source', 'source_found', 'source_read'].includes(event.event)
  )
  const citationEvents = events.filter(event => event.event === 'citation')

  assert(
    sourceEvents.length === 0,
    `expected no source events/source cards, got ${sourceEvents.map(event => event.event).join(', ')}`
  )
  assert(
    citationEvents.length === 0,
    `expected no citation events/links, got ${citationEvents.length}`
  )
  assert(
    !text.includes('"url"') || !sourceEvents.length,
    'unexpected source-like URL payload appeared in source events'
  )

  console.log(
    `[smoke:search-provider-outage] passed against ${baseUrl}/api/search/session; fallback completed with ${answer.length} answer chars, ${sourceEvents.length} source events, and ${citationEvents.length} citation events.`
  )
}

async function main() {
  const server = await ensureLocalServer()

  try {
    await runOutageSessionSmoke()
  } finally {
    const child: ChildProcessWithoutNullStreams | null = server.process
    if (child) {
      child.kill('SIGTERM')
    }
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
