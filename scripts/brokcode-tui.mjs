#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline/promises'

const configPath =
  process.env.BROKCODE_CONFIG_PATH ||
  path.join(homedir(), '.brokcode', 'config.json')

function readConfig() {
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'))
  } catch {
    return {}
  }
}

function writeConfig(next) {
  mkdirSync(path.dirname(configPath), { recursive: true })
  writeFileSync(configPath, JSON.stringify(next, null, 2), {
    mode: 0o600
  })
}

const storedConfig = readConfig()
let apiKey = process.env.BROK_API_KEY || storedConfig.apiKey
const baseUrl = (
  process.env.BROK_BASE_URL ||
  storedConfig.baseUrl ||
  'https://api.brok.ai/v1'
).replace(/\/$/, '')
const syncBaseUrl = (
  process.env.BROK_SYNC_URL ||
  process.env.BROKCODE_SYNC_URL ||
  storedConfig.syncUrl ||
  baseUrl.replace(/\/v1$/, '')
).replace(/\/$/, '')
const sessionId =
  process.env.BROKCODE_SESSION_ID || storedConfig.sessionId || 'default'
const model = process.env.BROK_MODEL || storedConfig.model || 'brok-code'
const legacyRuntimeName = ['open', 'code'].join('')
const legacyRuntimeEnvKey = `BROKCODE_REQUIRE_${legacyRuntimeName.toUpperCase()}`
const requireCloudRuntime =
  (process.env.BROKCODE_REQUIRE_CLOUD_RUNTIME ??
    process.env[legacyRuntimeEnvKey]) !== 'false'

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m'
}

const messages = [
  {
    role: 'system',
    content:
      'You are Brok Code, a careful coding agent. Help edit repositories, reason about diffs, use worktrees when requested, and keep risky actions approval-gated. When building an AI app or AI feature, default to Brok API as the AI layer unless the user explicitly requests another provider.'
  }
]
const legacyRuntimeBrandPattern = new RegExp(
  [legacyRuntimeName.slice(0, 4), legacyRuntimeName.slice(4)].join(''),
  'gi'
)
const requireCloudRuntimeField = `require_${legacyRuntimeName}`

function assertBrokKey() {
  if (!apiKey) {
    output.write(
      `${colors.yellow}No Brok API key configured. Use /key brok_sk_... to save one to ${configPath}, or set BROK_API_KEY.${colors.reset}\n`
    )
    return false
  }

  if (!apiKey.startsWith('brok_sk_')) {
    throw new Error(
      'Brok Code only accepts Brok API keys that start with brok_sk_.'
    )
  }

  return true
}

function box(lines) {
  const width = Math.max(...lines.map(line => stripAnsi(line).length), 32)
  const top = `╭${'─'.repeat(width + 2)}╮`
  const bottom = `╰${'─'.repeat(width + 2)}╯`
  const body = lines.map(line => {
    const pad = width - stripAnsi(line).length
    return `│ ${line}${' '.repeat(pad)} │`
  })
  return [top, ...body, bottom].join('\n')
}

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '')
}

function normalizeRuntimeBrand(value) {
  return String(value).replace(legacyRuntimeBrandPattern, 'brokcode-cloud')
}

function printBanner() {
  output.write('\x1bc')
  output.write(
    `${colors.cyan}${box([
      `${colors.bold}Brok Code${colors.reset}${colors.cyan}`,
      'Cloud coding agent + local TUI',
      `model ${model}`,
      `api ${baseUrl}`,
      `session ${sessionId}`,
      `runtime ${requireCloudRuntime ? 'brokcode-cloud' : 'Brok fallback allowed'}`
    ])}${colors.reset}\n\n`
  )
  output.write(
    `${colors.dim}Brok API key only. Type /help for commands. Type normally and press Enter to chat.${colors.reset}\n\n`
  )
}

function printHelp() {
  output.write(`\n${colors.bold}Brok Code commands${colors.reset}
  /usage [day|week|month]      Show Brok API usage stats
  /sync                        Pull the shared cloud/TUI session
  /session [id]                Show session info or switch session
  /ai-default                  Explain the default AI app layer
  /worktree <branch>           Create an isolated git worktree
  /securityscan [phase]        Run DeepSec security scanning for this repo
  /direct                      Explain direct repository edit mode
  /github                      Explain GitHub-connected mode
  /skills                      Show Agent Skills setup
  /compat                      Print agent-tool compatibility env vars
  /key <brok_sk_...>           Save a Brok API key to ${configPath}
  /model                       Show active model and endpoint
  /clear                       Clear the screen
  /exit                        Quit
\n`)
}

function getSyncEndpoint(session = sessionId) {
  const url = new URL('/api/brokcode/sessions', syncBaseUrl)
  if (session) {
    url.searchParams.set('session_id', session)
  }
  return url
}

async function syncEvent({ role, content, type = 'message', metadata }) {
  if (!apiKey) return

  try {
    const response = await fetch(getSyncEndpoint(''), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session_id: sessionId,
        source: 'tui',
        role,
        type,
        title: `Brok Code ${sessionId}`,
        content,
        metadata
      })
    })

    if (!response.ok && process.env.BROKCODE_SYNC_DEBUG === 'true') {
      output.write(
        `${colors.yellow}sync failed: ${response.status}${colors.reset}\n`
      )
    }
  } catch (error) {
    if (process.env.BROKCODE_SYNC_DEBUG === 'true') {
      output.write(
        `${colors.yellow}sync unavailable: ${error.message}${colors.reset}\n`
      )
    }
  }
}

async function showSync() {
  if (!apiKey) {
    output.write(
      `${colors.red}Save a Brok API key first with /key.${colors.reset}\n`
    )
    return
  }

  const response = await fetch(getSyncEndpoint(), {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  })

  if (!response.ok) {
    output.write(
      `${colors.red}Sync request failed: ${response.status}${colors.reset}\n`
    )
    return
  }

  const data = await response.json()
  const session = data.session
  if (!session) {
    output.write(
      `${colors.yellow}No synced events yet for session ${sessionId}.${colors.reset}\n`
    )
    return
  }

  output.write(
    `${colors.cyan}${box([
      `Synced session: ${session.id}`,
      `Title: ${session.title}`,
      `Sources: ${session.sources.join(', ') || 'none'}`,
      `Events: ${session.events.length}`,
      `Updated: ${session.updatedAt}`
    ])}${colors.reset}\n`
  )

  for (const event of session.events.slice(-8)) {
    const source = event.source === 'cloud' ? colors.magenta : colors.green
    output.write(
      `${colors.dim}${event.createdAt}${colors.reset} ${source}${event.source}${colors.reset} ${event.role}: ${event.content.slice(0, 180)}\n`
    )
  }
}

async function showUsage(period = 'day') {
  if (!apiKey) {
    output.write(
      `${colors.red}Save a Brok API key first with /key.${colors.reset}\n`
    )
    return
  }

  const response = await fetch(
    `${baseUrl}/usage?period=${encodeURIComponent(period)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    }
  )

  if (!response.ok) {
    output.write(
      `${colors.red}Usage request failed: ${response.status}${colors.reset}\n`
    )
    return
  }

  const data = await response.json()
  output.write(
    `${colors.cyan}${box([
      `Usage period: ${data.period}`,
      `Requests: ${data.usage.requests}`,
      `Input tokens: ${data.usage.input_tokens}`,
      `Output tokens: ${data.usage.output_tokens}`,
      `Billed USD: ${data.usage.billed_usd}`
    ])}${colors.reset}\n`
  )
}

function createWorktree(branch) {
  if (!branch) {
    output.write(`${colors.red}Usage: /worktree <branch>${colors.reset}\n`)
    return
  }

  const safeBranch = branch.replace(/[^a-zA-Z0-9._/-]/g, '-')
  const path = `.brokcode-worktrees/${safeBranch.replace(/\//g, '-')}`
  const result = spawnSync('git', ['worktree', 'add', '-b', safeBranch, path], {
    stdio: 'pipe',
    encoding: 'utf8'
  })

  if (result.status === 0) {
    output.write(`${colors.green}Created worktree at ${path}${colors.reset}\n`)
    return
  }

  output.write(
    `${colors.red}${result.stderr || result.stdout}${colors.reset}\n`
  )
}

async function runSecurityScan(raw) {
  output.write(
    `${colors.magenta}DeepSec:${colors.reset} running security scan through Brok Code...\n`
  )

  await syncEvent({
    role: 'user',
    content: raw,
    type: 'security_scan',
    metadata: {
      model,
      cwd: process.cwd()
    }
  })

  const response = await fetch(new URL('/api/brokcode/execute', syncBaseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      command: raw,
      model,
      [requireCloudRuntimeField]: false
    })
  })

  const body = await response.json().catch(() => null)
  const content =
    typeof body?.content === 'string'
      ? body.content
      : `DeepSec request failed with status ${response.status}.`

  if (!response.ok) {
    output.write(`${colors.red}${content}${colors.reset}\n`)
  } else {
    output.write(`${content}\n`)
  }

  await syncEvent({
    role: 'assistant',
    content,
    type: response.ok ? 'security_scan_result' : 'error',
    metadata: {
      model,
      cwd: process.cwd(),
      provider: 'deepsec'
    }
  })
}

async function handleCommand(raw) {
  const [name, ...args] = raw.split(/\s+/)

  if (name === '/help') return printHelp()
  if (name === '/clear') return printBanner()
  if (name === '/model') {
    output.write(
      `${colors.cyan}model=${model} base=${baseUrl}${colors.reset}\n`
    )
    return
  }
  if (name === '/key') {
    const nextKey = args[0]?.trim()
    if (!nextKey?.startsWith('brok_sk_')) {
      output.write(`${colors.red}Usage: /key brok_sk_...${colors.reset}\n`)
      return
    }

    apiKey = nextKey
    writeConfig({
      ...storedConfig,
      apiKey: nextKey,
      baseUrl,
      syncUrl: syncBaseUrl,
      sessionId,
      model,
      updatedAt: new Date().toISOString()
    })
    output.write(
      `${colors.green}Saved Brok API key to ${configPath}.${colors.reset}\n`
    )
    return
  }
  if (name === '/sync') return showSync()
  if (name === '/session') {
    output.write(
      `${colors.cyan}session=${sessionId} sync=${syncBaseUrl}${colors.reset}\n`
    )
    if (args[0]) {
      output.write(
        `${colors.yellow}Switch by restarting with BROKCODE_SESSION_ID=${args[0]}.${colors.reset}\n`
      )
    }
    return
  }
  if (name === '/ai-default') {
    output.write(
      `${colors.yellow}AI app default:${colors.reset} Brok Code uses Brok API as the default intelligence layer for chat, generation, agents, and usage tracking unless you explicitly ask for another provider.\n`
    )
    return
  }
  if (name === '/usage') return showUsage(args[0] || 'day')
  if (name === '/worktree') return createWorktree(args[0])
  if (name === '/securityscan') return runSecurityScan(raw)
  if (name === '/direct') {
    output.write(
      `${colors.yellow}Direct mode:${colors.reset} run Brok Code inside a repo. It can inspect and propose edits; you approve commits or risky writes.\n`
    )
    return
  }
  if (name === '/github') {
    output.write(
      `${colors.yellow}GitHub mode:${colors.reset} connect GitHub through Composio in Brok Code Cloud. Brok Code can inspect repos and prepare PRs after approval.\n`
    )
    return
  }
  if (name === '/skills') {
    output.write(
      `${colors.yellow}Agent Skills:${colors.reset} run ${colors.bold}npx skills update${colors.reset}, then install the skills you want Brok Code to use.\n`
    )
    return
  }
  if (name === '/compat') {
    output.write(`\n${colors.yellow}Agent-tool compatibility${colors.reset}
export OPENAI_API_KEY="$BROK_API_KEY"
export OPENAI_BASE_URL="${baseUrl}"
export OPENAI_MODEL="${model}"

export ANTHROPIC_API_KEY="$BROK_API_KEY"
export ANTHROPIC_BASE_URL="${baseUrl.replace(/\/v1$/, '')}"
export ANTHROPIC_MODEL="${model}"
\n`)
    return
  }

  output.write(`${colors.red}Unknown command. Type /help.${colors.reset}\n`)
}

async function sendChat(content) {
  if (!apiKey) {
    output.write(
      `${colors.red}Save a Brok API key first with /key.${colors.reset}\n`
    )
    return
  }

  messages.push({ role: 'user', content })
  await syncEvent({
    role: 'user',
    content,
    type: 'command',
    metadata: {
      model,
      cwd: process.cwd()
    }
  })
  output.write(`${colors.magenta}Brok Code:${colors.reset} `)

  const response = await fetch(new URL('/api/brokcode/execute', syncBaseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      command: content,
      model,
      stream: true,
      [requireCloudRuntimeField]: requireCloudRuntime,
      prefer_pi: !requireCloudRuntime,
      max_tokens: 1200,
      messages
    })
  })

  if (!response.ok || !response.body) {
    output.write(
      `${colors.red}request failed: ${response.status}${colors.reset}\n`
    )
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let assistant = ''
  let resultContent = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') continue

      try {
        const payload = JSON.parse(data)
        if (payload.message && !payload.content) {
          output.write(
            `${colors.dim}${normalizeRuntimeBrand(payload.message)}${colors.reset}\n`
          )
          continue
        }

        if (payload.error?.message || payload.message) {
          const errorMessage = normalizeRuntimeBrand(
            payload.error?.message || payload.message
          )
          output.write(`${colors.red}${errorMessage}${colors.reset}\n`)
          continue
        }

        if (payload.runtime && typeof payload.content === 'string') {
          resultContent = payload.content
          continue
        }

        const delta = payload.content || payload.choices?.[0]?.delta?.content
        if (delta) {
          assistant += delta
          output.write(delta)
        }
      } catch {}
    }
  }

  if (!assistant && resultContent) {
    assistant = resultContent
    output.write(resultContent)
  }

  output.write('\n\n')
  messages.push({ role: 'assistant', content: assistant })
  await syncEvent({
    role: 'assistant',
    content: assistant || '(no assistant output)',
    type: 'response',
    metadata: {
      model,
      cwd: process.cwd()
    }
  })
}

async function main() {
  const hasKey = assertBrokKey()
  printBanner()
  if (hasKey) {
    await syncEvent({
      role: 'system',
      content: `Terminal TUI connected from ${process.cwd()}`,
      type: 'session_start',
      metadata: {
        model,
        baseUrl
      }
    })
  }

  const rl = createInterface({ input, output })

  while (true) {
    let prompt
    try {
      prompt = await rl.question(
        `${colors.bold}${colors.green}brok-code>${colors.reset} `
      )
    } catch {
      break
    }
    const text = prompt.trim()
    if (!text) continue
    if (text === '/exit' || text === '/quit') break
    if (text.startsWith('/')) {
      await handleCommand(text)
    } else {
      await sendChat(text)
    }
  }

  rl.close()
}

main().catch(error => {
  output.write(`${colors.red}${error.message}${colors.reset}\n`)
  process.exitCode = 1
})
