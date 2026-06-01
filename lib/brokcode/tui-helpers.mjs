// Pure helpers for the Brok Code TUI. Kept dependency-free so the TUI can
// import them via plain Node ESM and unit tests can validate the contracts
// without spinning up the full script.

/**
 * @typedef {Object} HttpErrorInput
 * @property {number | null | undefined} [status]
 * @property {unknown} [body]
 * @property {string} [fallback]
 *
 * @typedef {Object} HttpErrorResult
 * @property {number | null} status
 * @property {string | null} code
 * @property {string} message
 * @property {string | null} hint
 * @property {boolean} isAuthError
 * @property {boolean} isRateLimited
 * @property {boolean} isServerError
 */

export const BROK_KEY_PREFIX = 'brok_sk_'

/**
 * @param {unknown} key
 * @returns {boolean}
 */
export function isValidBrokKey(key) {
  return typeof key === 'string' && key.startsWith(BROK_KEY_PREFIX)
}

/**
 * @param {unknown} key
 * @returns {string | null}
 */
export function normalizeBrokKey(key) {
  if (typeof key !== 'string') return null
  const trimmed = key.trim()
  if (!trimmed.startsWith(BROK_KEY_PREFIX)) return null
  return trimmed
}

const HTTP_ERROR_HINTS = {
  400: 'Request was rejected. Check the command/payload and try again.',
  401: 'API key is missing or invalid. Run /key brok_sk_... to set a new key.',
  403: 'API key is not authorized for this action. Check scopes or account ownership.',
  404: 'Resource not found. Verify the project id/slug with /projects.',
  409: 'Conflict. The resource changed since you last saw it. Refresh and retry.',
  413: 'Payload too large. Reduce the input size or file count.',
  422: 'Unprocessable. The request was understood but rejected by the server.',
  429: 'Rate limited. Wait a moment or check /usage for current consumption.',
  500: 'Server error. Retry the request. If it persists, run /doctor.',
  502: 'Upstream error. The model provider is unreachable. Retry shortly.',
  503: 'Runtime unavailable. The cloud builder is offline. Run /doctor.',
  504: 'Gateway timeout. The model took too long. Retry or switch runtimes.'
}

/**
 * @param {HttpErrorInput} input
 * @returns {HttpErrorResult}
 */
export function classifyHttpError({ status, body, fallback }) {
  const bodyMessage =
    (body &&
      typeof body === 'object' &&
      ((typeof body.error === 'string' && body.error) ||
        (body.error &&
          typeof body.error.message === 'string' &&
          body.error.message) ||
        (typeof body.message === 'string' && body.message))) ||
    null

  const hint = HTTP_ERROR_HINTS[status] || null
  const message =
    bodyMessage || hint || fallback || `Request failed with status ${status}.`

  return {
    status: status ?? null,
    code: (body && body.error && body.error.code) || null,
    message,
    hint: bodyMessage ? hint : null,
    isAuthError: status === 401 || status === 403,
    isRateLimited: status === 429,
    isServerError: typeof status === 'number' && status >= 500
  }
}

export function parseSseEvent(line) {
  if (typeof line !== 'string') return null
  if (line.startsWith('event:')) {
    return { kind: 'event', value: line.slice(6).trim() || 'message' }
  }
  if (line.startsWith('data:')) {
    const value = line.slice(5).trim()
    return { kind: 'data', value }
  }
  if (line === '') {
    return { kind: 'boundary' }
  }
  return null
}

// Splits a chunk of SSE bytes into complete event blocks. Returns the
// remaining (incomplete) buffer. A block is `event: x\ndata: y\n\n` or
// data-only `data: y\n\n`.
export function chunkSseBlocks(buffer) {
  const blocks = []
  let remaining = buffer
  let boundary = remaining.indexOf('\n\n')

  while (boundary !== -1) {
    const raw = remaining.slice(0, boundary)
    remaining = remaining.slice(boundary + 2)
    const parsed = parseSseBlock(raw)
    if (parsed) blocks.push(parsed)
    boundary = remaining.indexOf('\n\n')
  }

  return { blocks, remaining }
}

export function parseSseBlock(block) {
  let event = 'message'
  const dataLines = []

  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) {
      const value = line.slice(6).trim()
      if (value) event = value
      continue
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim())
    }
  }

  if (dataLines.length === 0) return null
  const joined = dataLines.join('\n')
  if (joined === '[DONE]') return { event, data: null, done: true }

  try {
    return { event, data: JSON.parse(joined), done: false }
  } catch {
    return null
  }
}

export function extractCommandName(text) {
  if (typeof text !== 'string') return null
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null
  const match = trimmed.match(/^\/([a-zA-Z][\w-]*)/)
  return match ? match[1].toLowerCase() : null
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export function spinnerFrame(index) {
  return SPINNER_FRAMES[Math.abs(index) % SPINNER_FRAMES.length]
}

export function truncateText(text, max = 200) {
  if (typeof text !== 'string') return ''
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1))}…`
}

export function formatPhaseLabel(phase) {
  if (!phase) return 'running'
  return String(phase).replace(/_/g, ' ')
}

const COMMAND_LIST = [
  'help',
  'usage',
  'sync',
  'session',
  'projects',
  'project',
  'preview',
  'deploy',
  'backend',
  'files',
  'file',
  'versions',
  'version',
  'ai-default',
  'worktree',
  'securityscan',
  'direct',
  'github',
  'skills',
  'compat',
  'key',
  'model',
  'doctor',
  'clear',
  'exit',
  'quit',
  'resume'
]

export function suggestCommands(partial) {
  if (typeof partial !== 'string' || !partial.startsWith('/')) return []
  const query = partial.toLowerCase()
  return COMMAND_LIST.map(name => `/${name}`)
    .filter(cmd => cmd.startsWith(query) && cmd !== query)
    .slice(0, 8)
}

export function buildReadlineCompleter(extra = []) {
  const commands = COMMAND_LIST.map(name => `/${name}`)
  return function completer(line) {
    if (!line.startsWith('/')) return [[], line]

    const tokens = line.split(/\s+/)
    const last = tokens[tokens.length - 1] || ''

    if (tokens.length === 1) {
      const matches = commands.filter(cmd => cmd.startsWith(last.toLowerCase()))
      return [matches, last]
    }

    const command = tokens[0].toLowerCase()
    if (command === '/project' && tokens.length === 2) {
      return [['new', 'select', 'show', 'rename', 'delete'], last]
    }
    if (command === '/backend' && tokens.length === 2) {
      return [['status', 'insforge', 'provision', 'check', 'clear'], last]
    }
    if (command === '/file' && tokens.length === 2) {
      return [['put', 'show', 'delete', 'rename', 'get'], last]
    }
    if (extra.length > 0) {
      const matches = extra.filter(value => value.startsWith(last))
      return [matches.length > 0 ? matches : extra, last]
    }

    return [[], last]
  }
}

export function relativeTime(iso) {
  if (typeof iso !== 'string') return ''
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const now = Date.now()
  const diff = Math.max(0, now - then)
  const sec = Math.floor(diff / 1000)
  if (sec < 5) return 'just now'
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  return new Date(iso).toISOString().slice(0, 10)
}
