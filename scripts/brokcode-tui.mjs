#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline/promises'

import {
  BROK_KEY_PREFIX,
  buildReadlineCompleter,
  chunkSseBlocks,
  classifyHttpError,
  extractCommandName,
  extractFencedCodeBlock,
  formatBytes,
  formatPhaseLabel,
  isDangerousShellCommand,
  isValidBrokKey,
  parseSseBlock,
  relativeTime,
  spinnerFrame,
  suggestCommands,
  truncateText
} from '../lib/brokcode/tui-helpers.mjs'

const configPath =
  process.env.BROKCODE_CONFIG_PATH ||
  path.join(homedir(), '.brokcode', 'config.json')

const historyPath = path.join(path.dirname(configPath), 'history')

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

function loadHistory() {
  try {
    return readFileSync(historyPath, 'utf8').split('\n').filter(Boolean)
  } catch {
    return []
  }
}

function appendHistory(line) {
  if (!line) return
  try {
    mkdirSync(path.dirname(historyPath), { recursive: true })
    appendFileSync(historyPath, `${line}\n`)
  } catch {}
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
let activeProjectId =
  process.env.BROKCODE_PROJECT_ID ||
  storedConfig.activeProjectId ||
  storedConfig.projectId ||
  ''
let activeTaskId = ''
const legacyRuntimeName = ['open', 'code'].join('')
const legacyRuntimeEnvKey = `BROKCODE_REQUIRE_${legacyRuntimeName.toUpperCase()}`
const requireCloudRuntime =
  (process.env.BROKCODE_REQUIRE_CLOUD_RUNTIME ??
    process.env[legacyRuntimeEnvKey]) === 'true'

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m'
}

const messages = [
  {
    role: 'system',
    content:
      'You are Brok Code, a careful coding agent. Help edit repositories, reason about diffs, use worktrees when requested, and keep risky actions approval-gated. When building an AI app or AI feature, default to Brok API as the AI layer unless the user explicitly requests another provider.'
  }
]
const onceCommand =
  readArgValue('--once') || readArgValue('-m') || process.env.BROKCODE_ONCE
const legacyRuntimeBrandPattern = new RegExp(
  [legacyRuntimeName.slice(0, 4), legacyRuntimeName.slice(4)].join(''),
  'gi'
)
const requireCloudRuntimeField = `require_${legacyRuntimeName}`

let activeController = null
let spinnerTimer = null
let spinnerFrameIndex = 0
let activeSpinnerLine = ''

function readArgValue(flag) {
  const index = process.argv.indexOf(flag)
  if (index === -1) return undefined

  return process.argv[index + 1]
}

function saveRuntimeConfig(overrides = {}) {
  writeConfig({
    ...readConfig(),
    apiKey,
    baseUrl,
    syncUrl: syncBaseUrl,
    sessionId,
    model,
    activeProjectId,
    ...overrides,
    updatedAt: new Date().toISOString()
  })
}

function assertBrokKey() {
  if (!apiKey) {
    output.write(
      `${colors.yellow}No Brok API key configured. Use /key brok_sk_... to save one to ${configPath}, or set BROK_API_KEY.${colors.reset}\n`
    )
    return false
  }

  if (!isValidBrokKey(apiKey)) {
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

function startSpinner(label) {
  stopSpinner()
  spinnerFrameIndex = 0
  activeSpinnerLine = label
  process.stdout.write('\x1b[?25l')
  spinnerTimer = setInterval(() => {
    if (!activeSpinnerLine) return
    const frame = spinnerFrame(spinnerFrameIndex++)
    process.stdout.write(
      `\r${colors.cyan}${frame}${colors.reset} ${colors.dim}${activeSpinnerLine}${colors.reset}`
    )
  }, 90)
}

function updateSpinnerLabel(label) {
  activeSpinnerLine = label
}

function stopSpinner() {
  if (spinnerTimer) {
    clearInterval(spinnerTimer)
    spinnerTimer = null
  }
  if (activeSpinnerLine) {
    process.stdout.write('\r\x1b[2K')
    activeSpinnerLine = ''
  }
  process.stdout.write('\x1b[?25h')
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
      `project ${activeProjectId || 'none'}`,
      `runtime ${requireCloudRuntime ? 'brokcode-cloud' : 'Brok fallback allowed'}`,
      `${colors.dim}/help for commands · Tab completes · ↑/↓ history · Ctrl+C cancel${colors.reset}`
    ])}${colors.reset}\n\n`
  )
  output.write(
    `${colors.dim}Brok API key only. Type /help for commands. Type normally and press Enter to chat.${colors.reset}\n\n`
  )
}

function printHelp() {
  output.write(`\n${colors.bold}Brok Code commands${colors.reset}
  /help                          Show this help
  /usage [day|week|month]        Show Brok API usage stats
  /sync                          Pull the shared cloud/TUI session
  /session [id]                  Show session info or switch session
  /projects                      List saved BrokCode projects
  /project new <name>            Create a saved project
  /project select <id|slug>      Select a project for file commands
  /project show                  Show the selected project
  /project rename <name>         Rename the selected project
  /project delete                Delete the selected project (with confirmation)
  /preview [id|slug]             Refresh and print the managed preview URL
  /deploy [id|slug]              Publish selected project to its managed URL
  /backend status                Show selected project backend
  /backend insforge <url> [key]  Link existing InsForge backend
  /backend provision             Create an InsForge trial backend
  /backend check                 Check selected backend health
  /backend clear                 Remove backend metadata
  /files [id|slug]               List files in a project
  /file put <path> <local>       Save a local file into the selected project
  /file show <path>              Print a saved file from the selected project
  /file delete <path>            Delete a file from the selected project
  /file rename <old> <new>       Rename a file in the selected project
  /versions [limit]              Show recent version history for this session
  /version <id>                  Show details of a saved version
  /resume [taskId]               Reconnect to an in-flight streaming task
  /doctor                        Diagnose config, key, and connectivity
  /ai-default                    Explain the default AI app layer
  /worktree <branch>             Create an isolated git worktree
  /securityscan [phase]          Run DeepSec security scanning for this repo
  /direct                        Explain direct repository edit mode
  /github                        Explain GitHub-connected mode
  /skills                        Show Agent Skills setup
  /compat                        Print agent-tool compatibility env vars
  /key <brok_sk_...>             Save a Brok API key to ${configPath}
  /key clear                     Remove the saved Brok API key
  /model                         Show active model and endpoint
  /clear                         Clear the screen
  /exit                          Quit
\n${colors.bold}Local terminal harness${colors.reset}  (everything is sent through the Brok API)
  /read <path>                   Read a local file with line numbers
  /head <path> <n>               Show the first n lines of a local file
  /tail <path> <n>               Show the last n lines of a local file
  /shell <cmd>                   Run a shell command from cwd (refuses destructive ones)
  /git status|diff|log|branch    Inspect the local git repo
  /build <prompt>                One-shot: send a build prompt to the active project
  /ask <file> <question>         Load a local file and ask Brok about it
  /edit <file> <instruction>     Load a local file, ask Brok to rewrite, save locally
\n${colors.dim}Keys: Tab autocompletes commands and project ids. ↑/↓ recall history. Ctrl+C cancels the current request.${colors.reset}
\n`)
}

function getSyncEndpoint(session = sessionId) {
  const url = new URL('/api/brokcode/sessions', syncBaseUrl)
  if (session) {
    url.searchParams.set('session_id', session)
  }
  return url
}

function getProjectsEndpoint() {
  return new URL('/api/brokcode/projects', syncBaseUrl)
}

function getProjectEndpoint(projectId) {
  return new URL(
    `/api/brokcode/projects/${encodeURIComponent(projectId)}`,
    syncBaseUrl
  )
}

function getProjectFilesEndpoint(projectId) {
  return new URL(
    `/api/brokcode/projects/${encodeURIComponent(projectId)}/files`,
    syncBaseUrl
  )
}

function getProjectPreviewEndpoint(projectId) {
  return new URL(
    `/api/brokcode/projects/${encodeURIComponent(projectId)}/preview`,
    syncBaseUrl
  )
}

function getDeployEndpoint() {
  return new URL('/api/brokcode/deploy', syncBaseUrl)
}

function getProjectBackendEndpoint(projectId) {
  return new URL(
    `/api/brokcode/projects/${encodeURIComponent(projectId)}/backend`,
    syncBaseUrl
  )
}

function getProjectBackendHealthEndpoint(projectId) {
  return new URL(
    `/api/brokcode/projects/${encodeURIComponent(projectId)}/backend/health`,
    syncBaseUrl
  )
}

function getInsForgeProvisionEndpoint() {
  return new URL('/api/brokcode/projects/insforge/provision', syncBaseUrl)
}

function getVersionsEndpoint() {
  const url = new URL('/api/brokcode/versions', syncBaseUrl)
  url.searchParams.set('session_id', sessionId)
  return url
}

function getTaskStatusUrl(taskId) {
  return new URL(`/api/tasks/${taskId}`, syncBaseUrl)
}

function getTaskEventsUrl(taskId) {
  return new URL(`/api/tasks/${taskId}/events`, syncBaseUrl)
}

function classifyError({ status, body, fallback }) {
  return classifyHttpError({ status, body, fallback })
}

async function requestJson(url, options = {}) {
  if (!assertBrokKey()) return null

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const { message, hint } = classifyError({
      status: response.status,
      body,
      fallback: `Request failed: ${response.status}`
    })
    output.write(`${colors.red}${message}${colors.reset}\n`)
    if (hint) {
      output.write(`${colors.dim}${hint}${colors.reset}\n`)
    }
    return null
  }

  return body
}

function formatProject(project) {
  const selected = project.id === activeProjectId ? '*' : ' '
  const username = project.username ? ` @${project.username}` : ''
  const backend = project.metadata?.backend
  const backendLabel =
    backend?.provider === 'insforge'
      ? ` InsForge:${backend.health || backend.status}`
      : ''
  return `${selected} ${project.name}${username}${backendLabel} ${colors.dim}${project.slug} ${project.id}${colors.reset}`
}

async function loadProjects() {
  const body = await requestJson(getProjectsEndpoint())
  return Array.isArray(body?.projects) ? body.projects : []
}

function findProject(projects, value) {
  const target = String(value || '')
    .trim()
    .toLowerCase()
  if (!target) return null

  return (
    projects.find(project => project.id.toLowerCase() === target) ||
    projects.find(project => project.slug?.toLowerCase() === target) ||
    projects.find(project => project.name?.toLowerCase() === target) ||
    null
  )
}

async function showProjects() {
  const projects = await loadProjects()
  if (!projects.length) {
    output.write(
      `${colors.yellow}No BrokCode projects yet. Create one with /project new <name>.${colors.reset}\n`
    )
    return
  }

  output.write(`${colors.cyan}BrokCode projects${colors.reset}\n`)
  for (const project of projects) {
    output.write(`${formatProject(project)}\n`)
  }
}

function parseProjectCreate(raw) {
  const value = raw.replace(/^\/project\s+new\s*/i, '').trim()
  const usernameMatch = value.match(/\s+--username\s+([a-zA-Z0-9._-]+)\s*$/)
  const username = usernameMatch?.[1] || null
  const name = usernameMatch
    ? value.slice(0, usernameMatch.index).trim()
    : value.trim()

  return { name, username }
}

async function createProject(raw) {
  const { name, username } = parseProjectCreate(raw)
  if (!name) {
    output.write(
      `${colors.red}Usage: /project new <name> [--username handle]${colors.reset}\n`
    )
    return
  }

  const body = await requestJson(getProjectsEndpoint(), {
    method: 'POST',
    body: JSON.stringify({ name, username })
  })
  const project = body?.project
  if (!project) return

  activeProjectId = project.id
  saveRuntimeConfig({ activeProjectId })
  output.write(
    `${colors.green}Created and selected ${project.name} (${project.slug}).${colors.reset}\n`
  )
}

async function selectProject(value) {
  if (!value) {
    output.write(
      `${colors.red}Usage: /project select <id|slug>${colors.reset}\n`
    )
    return
  }

  const projects = await loadProjects()
  const project = findProject(projects, value)
  if (!project) {
    output.write(
      `${colors.red}Project not found. Run /projects to see available projects.${colors.reset}\n`
    )
    return
  }

  activeProjectId = project.id
  saveRuntimeConfig({ activeProjectId })
  output.write(
    `${colors.green}Selected ${project.name} (${project.slug}).${colors.reset}\n`
  )
}

async function showSelectedProject() {
  if (!activeProjectId) {
    output.write(
      `${colors.yellow}No project selected. Run /projects or /project new <name>.${colors.reset}\n`
    )
    return
  }

  const projects = await loadProjects()
  const project = findProject(projects, activeProjectId)
  if (!project) {
    output.write(
      `${colors.red}Selected project was not found. Run /projects and select again.${colors.reset}\n`
    )
    return
  }

  output.write(
    `${colors.cyan}${box([
      `Project: ${project.name}`,
      `Slug: ${project.slug}`,
      `ID: ${project.id}`,
      `Username: ${project.username || 'none'}`,
      `Backend: ${formatBackendSummary(project.metadata?.backend)}`,
      `Updated: ${project.updatedAt || 'unknown'}`
    ])}${colors.reset}\n`
  )
}

async function renameSelectedProject(newName) {
  if (!newName) {
    output.write(`${colors.red}Usage: /project rename <name>${colors.reset}\n`)
    return
  }
  const projectId = await resolveProjectId()
  if (!projectId) return

  const body = await requestJson(getProjectEndpoint(projectId), {
    method: 'PATCH',
    body: JSON.stringify({ name: newName })
  })
  if (!body?.project) return
  output.write(
    `${colors.green}Renamed to ${body.project.name} (${body.project.slug}).${colors.reset}\n`
  )
}

async function deleteSelectedProject() {
  const projectId = await resolveProjectId()
  if (!projectId) return

  output.write(
    `${colors.yellow}Type 'yes' to confirm deleting this project and all of its files. This cannot be undone.${colors.reset}\n`
  )
  const confirm = (await promptLine(`${colors.bold}confirm>${colors.reset} `))
    ?.trim()
    .toLowerCase()
  if (confirm !== 'yes') {
    output.write(`${colors.dim}Cancelled.${colors.reset}\n`)
    return
  }

  const body = await requestJson(getProjectEndpoint(projectId), {
    method: 'DELETE'
  })
  if (!body) return

  if (activeProjectId === projectId) {
    activeProjectId = ''
    saveRuntimeConfig({ activeProjectId: '' })
  }
  output.write(`${colors.green}Deleted project ${projectId}.${colors.reset}\n`)
}

function formatBackendSummary(backend) {
  if (!backend || backend.provider !== 'insforge') return 'none'

  return [
    'InsForge',
    backend.status || 'unknown',
    backend.health ? `health=${backend.health}` : null,
    backend.projectUrl || null,
    backend.adminKeyConfigured ? 'admin-key=configured' : 'admin-key=missing'
  ]
    .filter(Boolean)
    .join(' ')
}

async function showBackendStatus() {
  const projectId = await resolveProjectId()
  if (!projectId) return

  const body = await requestJson(getProjectBackendEndpoint(projectId))
  if (!body) return

  const backend = body.backend
  output.write(
    `${colors.cyan}${box([
      `Project: ${body.project?.name || projectId}`,
      `Backend: ${formatBackendSummary(backend)}`,
      `Dashboard: ${backend?.dashboardUrl || 'none'}`,
      `Claim: ${backend?.claimUrl || 'none'}`,
      `Last check: ${backend?.lastHealthCheckedAt || 'never'}`
    ])}${colors.reset}\n`
  )
}

async function linkInsForgeBackend(args) {
  const projectId = await resolveProjectId()
  if (!projectId) return

  const projectUrl = args[1]
  if (!projectUrl) {
    output.write(
      `${colors.red}Usage: /backend insforge <project-url> [admin-key]${colors.reset}\n`
    )
    return
  }

  const body = await requestJson(getProjectBackendEndpoint(projectId), {
    method: 'PUT',
    body: JSON.stringify({
      backend: {
        provider: 'insforge',
        mode: 'existing',
        projectUrl,
        adminKey: args[2] || undefined
      }
    })
  })
  if (!body?.backend) return

  output.write(
    `${colors.green}Linked ${formatBackendSummary(body.backend)}.${colors.reset}\n`
  )
}

async function provisionInsForgeBackend() {
  const body = await requestJson(getInsForgeProvisionEndpoint(), {
    method: 'POST',
    body: JSON.stringify({
      project_id: activeProjectId || undefined,
      projectName: activeProjectId ? undefined : 'BrokCode TUI app'
    })
  })
  if (!body?.project) return

  activeProjectId = body.project.id
  saveRuntimeConfig({ activeProjectId })
  output.write(
    `${colors.green}Provisioned ${formatBackendSummary(body.backend)}.${colors.reset}\n`
  )
}

async function checkBackendHealth() {
  const projectId = await resolveProjectId()
  if (!projectId) return

  const body = await requestJson(getProjectBackendHealthEndpoint(projectId), {
    method: 'POST'
  })
  if (!body?.backend) return

  output.write(
    `${colors.green}Backend check: ${formatBackendSummary(body.backend)}.${colors.reset}\n`
  )
}

async function clearBackend() {
  const projectId = await resolveProjectId()
  if (!projectId) return

  const body = await requestJson(getProjectBackendEndpoint(projectId), {
    method: 'PUT',
    body: JSON.stringify({ provider: 'none' })
  })
  if (!body?.backend) return

  output.write(`${colors.green}Backend cleared.${colors.reset}\n`)
}

async function resolveProjectId(value) {
  if (value) {
    const projects = await loadProjects()
    const project = findProject(projects, value)
    if (!project) {
      output.write(
        `${colors.red}Project not found. Run /projects to see available projects.${colors.reset}\n`
      )
      return null
    }
    return project.id
  }

  if (!activeProjectId) {
    output.write(
      `${colors.red}Select a project first with /project select <id|slug>.${colors.reset}\n`
    )
    return null
  }

  return activeProjectId
}

async function showProjectFiles(value) {
  const projectId = await resolveProjectId(value)
  if (!projectId) return

  const body = await requestJson(getProjectFilesEndpoint(projectId))
  if (!body) return

  const files = Array.isArray(body.files) ? body.files : []
  output.write(
    `${colors.cyan}${body.project?.name || 'Project'} files${colors.reset}\n`
  )

  if (!files.length) {
    output.write(
      `${colors.yellow}No files yet. Save one with /file put <path> <local-file>.${colors.reset}\n`
    )
    return
  }

  for (const file of files) {
    output.write(
      `${file.path} ${colors.dim}${file.language || 'text'} ${formatBytes(file.content?.length ?? 0)} ${relativeTime(file.updatedAt)}${colors.reset}\n`
    )
  }
}

async function showProjectFile(targetPath, projectRef) {
  if (!targetPath) {
    output.write(
      `${colors.red}Usage: /file show <path> [--project id|slug]${colors.reset}\n`
    )
    return
  }
  const projectId = await resolveProjectId(projectRef)
  if (!projectId) return

  const body = await requestJson(getProjectFilesEndpoint(projectId))
  if (!body) return
  const file = (body.files || []).find(
    candidate => candidate.path === targetPath
  )
  if (!file) {
    output.write(
      `${colors.yellow}File not found: ${targetPath}${colors.reset}\n`
    )
    return
  }
  output.write(
    `${colors.cyan}──── ${file.path} (${formatBytes(file.content?.length ?? 0)}) ────${colors.reset}\n`
  )
  output.write(file.content || '')
  if (!file.content?.endsWith('\n')) output.write('\n')
  output.write(`${colors.cyan}──── end ────${colors.reset}\n`)
}

async function refreshProjectPreview(value) {
  const projectId = await resolveProjectId(value)
  if (!projectId) return

  const body = await requestJson(getProjectPreviewEndpoint(projectId), {
    method: 'POST'
  })
  if (!body?.previewUrl) return

  output.write(
    `${colors.green}Preview ready:${colors.reset} ${body.previewUrl}\n`
  )
  if (body.fileCount !== undefined) {
    output.write(`${colors.dim}Files: ${body.fileCount}${colors.reset}\n`)
  }
}

async function deployProject(value) {
  const projectId = await resolveProjectId(value)
  if (!projectId) return

  const body = await requestJson(getDeployEndpoint(), {
    method: 'POST',
    body: JSON.stringify({
      project_id: projectId,
      source: 'tui'
    })
  })
  if (!body) return

  const url = body.deploymentPreviewUrl || body.previewUrl
  output.write(
    `${colors.green}Deploy ${body.status || 'ready'}:${colors.reset} ${
      url || body.message || 'no URL returned'
    }\n`
  )
  if (body.strategy) {
    output.write(`${colors.dim}Strategy: ${body.strategy}${colors.reset}\n`)
  }
}

async function putProjectFile(args) {
  const projectPath = args[1]
  const localPath = args[2]
  const projectFlagIndex = args.indexOf('--project')
  const projectRef =
    projectFlagIndex >= 0 && args[projectFlagIndex + 1]
      ? args[projectFlagIndex + 1]
      : null

  if (!projectPath || !localPath) {
    output.write(
      `${colors.red}Usage: /file put <project-path> <local-file> [--project id|slug]${colors.reset}\n`
    )
    return
  }

  const projectId = await resolveProjectId(projectRef)
  if (!projectId) return

  let content
  try {
    content = readFileSync(path.resolve(process.cwd(), localPath), 'utf8')
  } catch (error) {
    output.write(
      `${colors.red}Could not read ${localPath}: ${error.message}${colors.reset}\n`
    )
    return
  }

  const body = await requestJson(getProjectFilesEndpoint(projectId), {
    method: 'PUT',
    body: JSON.stringify({
      path: projectPath,
      content
    })
  })
  if (!body?.file) return

  output.write(
    `${colors.green}Saved ${body.file.path} (${formatBytes(content.length)}).${colors.reset}\n`
  )
}

async function deleteProjectFile(targetPath, projectRef) {
  if (!targetPath) {
    output.write(
      `${colors.red}Usage: /file delete <path> [--project id|slug]${colors.reset}\n`
    )
    return
  }
  const projectId = await resolveProjectId(projectRef)
  if (!projectId) return

  const body = await requestJson(getProjectFilesEndpoint(projectId), {
    method: 'POST',
    body: JSON.stringify({
      operations: [{ type: 'delete_file', path: targetPath }]
    })
  })
  if (!body) return

  output.write(
    `${colors.green}Deleted ${targetPath} (${body.changes?.length ?? 0} change(s)).${colors.reset}\n`
  )
}

async function renameProjectFile(args) {
  const fromPath = args[1]
  const toPath = args[2]
  const projectFlagIndex = args.indexOf('--project')
  const projectRef =
    projectFlagIndex >= 0 && args[projectFlagIndex + 1]
      ? args[projectFlagIndex + 1]
      : null

  if (!fromPath || !toPath) {
    output.write(
      `${colors.red}Usage: /file rename <old-path> <new-path> [--project id|slug]${colors.reset}\n`
    )
    return
  }
  const projectId = await resolveProjectId(projectRef)
  if (!projectId) return

  const body = await requestJson(getProjectFilesEndpoint(projectId), {
    method: 'POST',
    body: JSON.stringify({
      operations: [{ type: 'rename_file', path: fromPath, to_path: toPath }]
    })
  })
  if (!body) return

  output.write(
    `${colors.green}Renamed ${fromPath} → ${toPath}.${colors.reset}\n`
  )
}

async function showVersions(limitArg) {
  if (!apiKey) {
    output.write(
      `${colors.red}Save a Brok API key first with /key.${colors.reset}\n`
    )
    return
  }

  const url = getVersionsEndpoint()
  if (limitArg) {
    const parsed = Number.parseInt(limitArg, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      url.searchParams.set('limit', String(parsed))
    }
  }

  const body = await requestJson(url)
  if (!body) return

  const versions = Array.isArray(body.versions) ? body.versions : []
  if (!versions.length) {
    output.write(
      `${colors.yellow}No saved versions for session ${sessionId}.${colors.reset}\n`
    )
    return
  }

  output.write(
    `${colors.cyan}Recent versions for ${sessionId}${colors.reset}\n`
  )
  for (const version of versions.slice(0, 20)) {
    const status = version.status === 'error' ? colors.red : colors.green
    output.write(
      `${status}●${colors.reset} ${version.id} ${colors.dim}${relativeTime(version.createdAt)}${colors.reset} ${truncateText(version.command || '', 60)} ${colors.dim}r=${version.runtime || 'unknown'}${colors.reset}\n`
    )
  }
  if (versions.length > 20) {
    output.write(
      `${colors.dim}… and ${versions.length - 20} more. Pass a limit, e.g. /versions 50.${colors.reset}\n`
    )
  }
}

async function showVersion(versionId) {
  if (!versionId) {
    output.write(`${colors.red}Usage: /version <id>${colors.reset}\n`)
    return
  }
  if (!apiKey) {
    output.write(
      `${colors.red}Save a Brok API key first with /key.${colors.reset}\n`
    )
    return
  }

  const url = new URL(
    `/api/brokcode/versions/${encodeURIComponent(versionId)}`,
    syncBaseUrl
  )
  const body = await requestJson(url)
  if (!body) return
  const version = body.version
  if (!version) {
    output.write(
      `${colors.yellow}Version ${versionId} not found.${colors.reset}\n`
    )
    return
  }
  const lines = [
    `Version: ${version.id}`,
    `Created: ${version.createdAt} (${relativeTime(version.createdAt)})`,
    `Runtime: ${version.runtime || 'unknown'}`,
    `Status: ${version.status || 'done'}`,
    `Project: ${version.projectId || 'none'}`,
    `Checkpoint: ${version.checkpointName || 'none'}`,
    `Branch: ${version.branch || 'none'}`,
    `Commit: ${version.commitSha || 'none'}`,
    `PR: ${version.prUrl || 'none'}`,
    `Preview: ${version.previewUrl || 'none'}`,
    `Deployment: ${version.deploymentUrl || 'none'}`,
    '',
    `Command: ${version.command || ''}`,
    '',
    `Summary:`
  ]
  for (const line of (version.summary || '').split('\n').slice(0, 20)) {
    lines.push(`  ${line}`)
  }
  output.write(`${colors.cyan}${box(lines)}${colors.reset}\n`)
  if (Array.isArray(version.files) && version.files.length > 0) {
    output.write(
      `${colors.dim}${version.files.length} file snapshot(s) attached. Use /version ${version.id} via API to download.${colors.reset}\n`
    )
  }
}

async function runDoctor() {
  output.write(`${colors.cyan}Brok Code doctor${colors.reset}\n`)

  output.write(`  config: ${configPath}\n`)
  output.write(`  history: ${historyPath}\n`)

  if (!apiKey) {
    output.write(`  ${colors.red}✗${colors.reset} api key: missing\n`)
  } else if (!isValidBrokKey(apiKey)) {
    output.write(
      `  ${colors.red}✗${colors.reset} api key: invalid (must start with ${BROK_KEY_PREFIX})\n`
    )
  } else {
    output.write(
      `  ${colors.green}✓${colors.reset} api key: ${apiKey.slice(0, 12)}…\n`
    )
  }

  output.write(`  base url: ${baseUrl}\n`)
  output.write(`  sync url: ${syncBaseUrl}\n`)
  output.write(`  session: ${sessionId}\n`)
  output.write(`  model: ${model}\n`)
  output.write(
    `  cloud runtime required: ${requireCloudRuntime ? 'yes' : 'no'}\n`
  )
  if (activeProjectId) {
    output.write(`  active project: ${activeProjectId}\n`)
  }

  await pingUrl('base url', new URL('/api/v1/models', baseUrl).toString())
  await pingUrl('sync url', syncBaseUrl)
  await pingUrl(
    'execute endpoint',
    new URL('/api/brokcode/execute', syncBaseUrl).toString()
  )

  if (apiKey) {
    try {
      const body = await requestJson(getProjectsEndpoint())
      if (body) {
        const count = Array.isArray(body.projects) ? body.projects.length : 0
        output.write(
          `  ${colors.green}✓${colors.reset} projects accessible: ${count} found\n`
        )
      }
    } catch (error) {
      output.write(
        `  ${colors.red}✗${colors.reset} projects endpoint: ${error.message}\n`
      )
    }
  }

  output.write(
    `\n${colors.dim}Tip: a green ✓ means the probe succeeded, ✗ means it failed.${colors.reset}\n`
  )
}

async function pingUrl(label, url) {
  if (!url) {
    output.write(`  ${colors.yellow}?${colors.reset} ${label}: no url\n`)
    return
  }
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const response = await fetch(url, {
      method: 'GET',
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: controller.signal
    }).catch(error => ({ ok: false, status: 0, error }))
    clearTimeout(timeout)
    const ok = response && response.ok
    const status = response && response.status
    if (ok) {
      output.write(`  ${colors.green}✓${colors.reset} ${label}: ${status}\n`)
    } else if (status === 0) {
      output.write(
        `  ${colors.red}✗${colors.reset} ${label}: ${response?.error?.message || 'unreachable'}\n`
      )
    } else {
      output.write(`  ${colors.yellow}!${colors.reset} ${label}: ${status}\n`)
    }
  } catch (error) {
    output.write(`  ${colors.red}✗${colors.reset} ${label}: ${error.message}\n`)
  }
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
      `${colors.dim}${event.createdAt}${colors.reset} ${source}${event.source}${colors.reset} ${event.role}: ${truncateText(event.content, 180)}\n`
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

const DANGEROUS_SHELL_PATTERNS = []

function resolveLocalPath(target) {
  if (typeof target !== 'string' || !target) return null
  if (target === '~') return homedir()
  if (target.startsWith('~/')) return path.join(homedir(), target.slice(2))
  if (path.isAbsolute(target)) return target
  return path.resolve(process.cwd(), target)
}

function readLocalTextFile(targetPath) {
  const resolved = resolveLocalPath(targetPath)
  if (!resolved) {
    return { error: 'No file path provided.' }
  }
  if (!existsSync(resolved)) {
    return { error: `File not found: ${resolved}` }
  }
  const stat = statSync(resolved)
  if (stat.isDirectory()) {
    return { error: `Path is a directory: ${resolved}` }
  }
  if (stat.size > 512_000) {
    return {
      error: `File is too large to read (${formatBytes(stat.size)}; cap is 512 KB). Use /head or /tail with a number.`
    }
  }
  return { path: resolved, content: readFileSync(resolved, 'utf8') }
}

function readLocalFileSlice(targetPath, mode, linesArg) {
  const lines = Number.parseInt(linesArg, 10)
  if (!Number.isFinite(lines) || lines <= 0) {
    return { error: 'Lines must be a positive number.' }
  }
  const resolved = resolveLocalPath(targetPath)
  if (!resolved || !existsSync(resolved)) {
    return { error: `File not found: ${resolved ?? targetPath}` }
  }
  const content = readFileSync(resolved, 'utf8').split(/\r?\n/)
  let slice
  if (mode === 'head') {
    slice = content.slice(0, lines)
  } else if (mode === 'tail') {
    slice = content.slice(-lines)
  } else {
    return { error: `Unknown mode: ${mode}` }
  }
  return { path: resolved, content: slice.join('\n') }
}

function showLocalFile(targetPath) {
  if (!targetPath) {
    output.write(`${colors.red}Usage: /read <path>${colors.reset}\n`)
    return
  }
  const result = readLocalTextFile(targetPath)
  if (result.error) {
    output.write(`${colors.red}${result.error}${colors.reset}\n`)
    return
  }
  const lines = result.content.split(/\r?\n/)
  const width = String(lines.length).length
  output.write(
    `${colors.cyan}──── ${result.path} (${lines.length} lines, ${formatBytes(result.content.length)}) ────${colors.reset}\n`
  )
  lines.forEach((line, index) => {
    const padded = String(index + 1).padStart(width, ' ')
    output.write(`${colors.dim}${padded}${colors.reset} │ ${line}\n`)
  })
  output.write(`${colors.cyan}──── end ────${colors.reset}\n`)
}

function showLocalFileHead(targetPath, linesArg) {
  const result = readLocalFileSlice(targetPath, 'head', linesArg)
  if (result.error) {
    output.write(`${colors.red}${result.error}${colors.reset}\n`)
    return
  }
  output.write(
    `${colors.cyan}──── ${result.path} (first ${linesArg} lines) ────${colors.reset}\n${result.content}\n${colors.cyan}──── end ────${colors.reset}\n`
  )
}

function showLocalFileTail(targetPath, linesArg) {
  const result = readLocalFileSlice(targetPath, 'tail', linesArg)
  if (result.error) {
    output.write(`${colors.red}${result.error}${colors.reset}\n`)
    return
  }
  output.write(
    `${colors.cyan}──── ${result.path} (last ${linesArg} lines) ────${colors.reset}\n${result.content}\n${colors.cyan}──── end ────${colors.reset}\n`
  )
}

function writeLocalFile(targetPath, content) {
  const resolved = resolveLocalPath(targetPath)
  if (!resolved) {
    return { error: 'No file path provided.' }
  }
  try {
    mkdirSync(path.dirname(resolved), { recursive: true })
    writeFileSync(resolved, content, 'utf8')
    return { path: resolved, bytes: content.length }
  } catch (error) {
    return { error: `Could not write ${resolved}: ${error.message}` }
  }
}

async function runShellCommand(rawArgs) {
  const cmd = rawArgs.join(' ').trim()
  if (!cmd) {
    output.write(`${colors.red}Usage: /shell <command>${colors.reset}\n`)
    return
  }
  if (isDangerousShellCommand(cmd)) {
    output.write(
      `${colors.yellow}That command looks destructive:${colors.reset} ${cmd}\n`
    )
    output.write(
      `${colors.yellow}Run it directly in your shell if you really mean it.${colors.reset}\n`
    )
    return
  }

  const startedAt = Date.now()
  const result = spawnSync(cmd, {
    cwd: process.cwd(),
    shell: true,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  })
  const elapsedMs = Date.now() - startedAt

  if (result.stdout) output.write(result.stdout)
  if (result.stderr) {
    output.write(`${colors.yellow}${result.stderr}${colors.reset}\n`)
  }
  const status = result.status ?? 0
  const exitLabel =
    status === 0
      ? `${colors.green}exit 0${colors.reset}`
      : `${colors.red}exit ${status}${colors.reset}`
  output.write(`${colors.dim}${exitLabel} in ${elapsedMs}ms${colors.reset}\n`)
}

function runGitCommand(subArgs) {
  const subcommand = (subArgs[0] || 'status').toLowerCase()
  const allowed = new Set(['status', 'diff', 'log', 'branch', 'show'])
  if (!allowed.has(subcommand)) {
    output.write(
      `${colors.red}Usage: /git status|diff|log [n]|branch|show <ref>${colors.reset}\n`
    )
    return
  }
  const args = ['git', subcommand, ...subArgs.slice(1)]
  const result = spawnSync(args[0], args.slice(1), {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  })
  if (result.stdout) output.write(result.stdout)
  if (result.stderr && result.status !== 0) {
    output.write(`${colors.yellow}${result.stderr}${colors.reset}\n`)
  }
  if (result.status !== 0) {
    output.write(
      `${colors.dim}git ${subcommand} exited ${result.status}${colors.reset}\n`
    )
  }
}

async function runBuildCommand(rawArgs) {
  const prompt = rawArgs.join(' ').trim()
  if (!prompt) {
    output.write(`${colors.red}Usage: /build <prompt>${colors.reset}\n`)
    return
  }
  if (!activeProjectId) {
    output.write(
      `${colors.red}Select or create a project first. /project new <name>, then /build <prompt>.${colors.reset}\n`
    )
    return
  }
  await sendChat(prompt)
}

async function askAboutLocalFile(args) {
  const filePath = args[0]
  const question = args.slice(1).join(' ').trim()
  if (!filePath || !question) {
    output.write(`${colors.red}Usage: /ask <file> <question>${colors.reset}\n`)
    return
  }
  const result = readLocalTextFile(filePath)
  if (result.error) {
    output.write(`${colors.red}${result.error}${colors.reset}\n`)
    return
  }
  const composed = `File: ${result.path}\n\n\`\`\`\n${result.content}\n\`\`\`\n\nQuestion: ${question}`
  await sendChat(composed)
}

async function editLocalFile(args) {
  const filePath = args[0]
  const instruction = args.slice(1).join(' ').trim()
  if (!filePath || !instruction) {
    output.write(
      `${colors.red}Usage: /edit <file> <instruction>${colors.reset}\n`
    )
    return
  }
  const result = readLocalTextFile(filePath)
  if (result.error) {
    output.write(`${colors.red}${result.error}${colors.reset}\n`)
    return
  }
  output.write(
    `${colors.cyan}Asking Brok to edit ${result.path}…${colors.reset}\n`
  )

  const response = await fetch(new URL('/api/brokcode/execute', syncBaseUrl), {
    method: 'POST',
    signal: activeController?.signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      command: `Rewrite the file at ${result.path} according to the instruction. Return the complete new file content inside a single fenced code block with the original language tag, no extra commentary.`,
      model,
      source: 'tui',
      session_id: sessionId,
      project_id: activeProjectId || undefined,
      stream: true,
      [requireCloudRuntimeField]: requireCloudRuntime,
      prefer_pi: !requireCloudRuntime,
      messages: [
        {
          role: 'system',
          content:
            'You are Brok Code, a careful coding agent. When asked to rewrite a file, return only the complete new file content in a single fenced code block with the matching language tag, no commentary.'
        },
        {
          role: 'user',
          content: `File: ${result.path}\n\nOriginal content:\n\`\`\`\n${result.content}\n\`\`\`\n\nInstruction: ${instruction}\n\nReturn the rewritten file in a single fenced code block.`
        }
      ]
    })
  })

  if (!response.ok || !response.body) {
    const { message } = classifyError({
      status: response.status,
      body: await response.json().catch(() => null),
      fallback: `request failed: ${response.status}`
    })
    output.write(`${colors.red}${message}${colors.reset}\n`)
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let assistant = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const { blocks, remaining } = chunkSseBlocks(buffer)
    buffer = remaining
    for (const block of blocks) {
      if (block.done || !block.data) continue
      if (block.event === 'error' || block.data.error) continue
      const delta =
        block.data.content || block.data.choices?.[0]?.delta?.content
      if (delta) assistant += delta
    }
  }

  const match = extractFencedCodeBlock(assistant)
  if (!match) {
    output.write(
      `${colors.red}Brok did not return a fenced code block. Aborting write.${colors.reset}\n`
    )
    return
  }
  const newContent = match
  const writeResult = writeLocalFile(filePath, newContent)
  if (writeResult.error) {
    output.write(`${colors.red}${writeResult.error}${colors.reset}\n`)
    return
  }
  output.write(
    `${colors.green}Wrote ${writeResult.path} (${formatBytes(writeResult.bytes)}).${colors.reset}\n`
  )
}

async function handleCommand(raw) {
  const trimmed = raw.trim()
  const name = extractCommandName(trimmed)
  if (!name) {
    output.write(
      `${colors.red}Commands must start with /. Type /help.${colors.reset}\n`
    )
    return
  }
  const args = trimmed.split(/\s+/)

  if (name === 'help') return printHelp()
  if (name === 'clear') return printBanner()
  if (name === 'doctor') return runDoctor()
  if (name === 'model') {
    output.write(
      `${colors.cyan}model=${model} base=${baseUrl}${colors.reset}\n`
    )
    return
  }
  if (name === 'key') {
    const next = args[1]?.trim()
    if (next === 'clear') {
      apiKey = ''
      const nextConfig = { ...readConfig() }
      delete nextConfig.apiKey
      writeConfig({ ...nextConfig, updatedAt: new Date().toISOString() })
      output.write(
        `${colors.green}Removed Brok API key from ${configPath}.${colors.reset}\n`
      )
      return
    }
    if (!next || !next.startsWith(BROK_KEY_PREFIX)) {
      output.write(
        `${colors.red}Usage: /key brok_sk_... (or /key clear to remove)${colors.reset}\n`
      )
      return
    }

    apiKey = next
    saveRuntimeConfig({ apiKey: next })
    output.write(
      `${colors.green}Saved Brok API key to ${configPath}.${colors.reset}\n`
    )
    return
  }
  if (name === 'sync') return showSync()
  if (name === 'session') {
    output.write(
      `${colors.cyan}session=${sessionId} sync=${syncBaseUrl}${colors.reset}\n`
    )
    if (args[1]) {
      output.write(
        `${colors.yellow}Switch by restarting with BROKCODE_SESSION_ID=${args[1]}.${colors.reset}\n`
      )
    }
    return
  }
  if (name === 'projects') return showProjects()
  if (name === 'project') {
    if (args[1] === 'new') return createProject(trimmed)
    if (args[1] === 'select') return selectProject(args[2])
    if (args[1] === 'rename')
      return renameSelectedProject(args.slice(2).join(' '))
    if (args[1] === 'delete') return deleteSelectedProject()
    if (args[1] === 'show' || !args[1]) return showSelectedProject()

    output.write(
      `${colors.red}Usage: /project new <name>, /project select <id|slug>, /project show, /project rename <name>, or /project delete.${colors.reset}\n`
    )
    return
  }
  if (name === 'backend') {
    if (args[1] === 'status' || !args[1]) return showBackendStatus()
    if (args[1] === 'insforge') return linkInsForgeBackend(args)
    if (args[1] === 'provision') return provisionInsForgeBackend()
    if (args[1] === 'check') return checkBackendHealth()
    if (args[1] === 'clear') return clearBackend()

    output.write(
      `${colors.red}Usage: /backend status, /backend insforge <url> [admin-key], /backend provision, /backend check, or /backend clear.${colors.reset}\n`
    )
    return
  }
  if (name === 'preview') return refreshProjectPreview(args[1])
  if (name === 'deploy') return deployProject(args[1])
  if (name === 'files') return showProjectFiles(args[1])
  if (name === 'file') {
    if (args[1] === 'put') return putProjectFile(args)
    if (args[1] === 'show' || args[1] === 'get') {
      return showProjectFile(args[2], extractProjectFlag(args))
    }
    if (args[1] === 'delete' || args[1] === 'rm') {
      return deleteProjectFile(args[2], extractProjectFlag(args))
    }
    if (args[1] === 'rename' || args[1] === 'mv') {
      return renameProjectFile(args)
    }

    output.write(
      `${colors.red}Usage: /file put <project-path> <local-file>, /file show <path>, /file delete <path>, or /file rename <old> <new>.${colors.reset}\n`
    )
    return
  }
  if (name === 'versions') return showVersions(args[1])
  if (name === 'version') return showVersion(args[1])
  if (name === 'resume') return resumeTask(args[1])
  if (name === 'ai-default') {
    output.write(
      `${colors.yellow}AI app default:${colors.reset} Brok Code uses Brok API as the default intelligence layer for chat, generation, agents, and usage tracking unless you explicitly ask for another provider.\n`
    )
    return
  }
  if (name === 'usage') return showUsage(args[1] || 'day')
  if (name === 'worktree') return createWorktree(args[1])
  if (name === 'securityscan') return runSecurityScan(trimmed)
  if (name === 'read') return showLocalFile(args[1])
  if (name === 'head') return showLocalFileHead(args[1], args[2])
  if (name === 'tail') return showLocalFileTail(args[1], args[2])
  if (name === 'shell' || name === 'sh' || name === '!') {
    return runShellCommand(args.slice(1))
  }
  if (name === 'git') return runGitCommand(args.slice(1))
  if (name === 'build') return runBuildCommand(args.slice(1))
  if (name === 'ask') return askAboutLocalFile(args.slice(1))
  if (name === 'edit') return editLocalFile(args.slice(1))
  if (name === 'direct') {
    output.write(
      `${colors.yellow}Direct mode:${colors.reset} run Brok Code inside a repo. It can inspect and propose edits; you approve commits or risky writes.\n`
    )
    return
  }
  if (name === 'github') {
    output.write(
      `${colors.yellow}GitHub mode:${colors.reset} connect GitHub through Composio in Brok Code Cloud. Brok Code can inspect repos and prepare PRs after approval.\n`
    )
    return
  }
  if (name === 'skills') {
    output.write(
      `${colors.yellow}Agent Skills:${colors.reset} run ${colors.bold}npx skills update${colors.reset}, then install the skills you want Brok Code to use.\n`
    )
    return
  }
  if (name === 'compat') {
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
  if (name === 'exit' || name === 'quit') {
    output.write(`${colors.dim}Use Ctrl+C or /exit twice.${colors.reset}\n`)
    return
  }

  const suggestions = suggestCommands(`/${name}`)
  if (suggestions.length > 0) {
    output.write(
      `${colors.red}Unknown command /${name}.${colors.reset} Did you mean: ${suggestions.join(', ')}?\n`
    )
  } else {
    output.write(`${colors.red}Unknown command. Type /help.${colors.reset}\n`)
  }
}

function extractProjectFlag(args) {
  const index = args.indexOf('--project')
  if (index === -1) return null
  return args[index + 1] || null
}

async function resumeTask(taskId) {
  if (!taskId) {
    if (activeTaskId) taskId = activeTaskId
    else {
      output.write(`${colors.red}Usage: /resume <taskId>${colors.reset}\n`)
      return
    }
  }
  if (!apiKey) {
    output.write(
      `${colors.red}Save a Brok API key first with /key.${colors.reset}\n`
    )
    return
  }

  output.write(`${colors.dim}Reconnecting to task ${taskId}…${colors.reset}\n`)

  try {
    const response = await fetch(getTaskEventsUrl(taskId), {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    if (!response.ok) {
      output.write(
        `${colors.red}Resume failed: ${response.status}${colors.reset}\n`
      )
      return
    }
    const data = await response.json()
    const events = Array.isArray(data?.events) ? data.events : []
    output.write(
      `${colors.cyan}Replayed ${events.length} event(s) for task ${taskId}.${colors.reset}\n`
    )
    for (const event of events.slice(-10)) {
      output.write(
        `${colors.dim}${event.at || ''}${colors.reset} ${event.event || 'message'}: ${truncateText(event.message || JSON.stringify(event.payload || {}), 160)}\n`
      )
    }
  } catch (error) {
    output.write(
      `${colors.red}Resume failed: ${error.message}${colors.reset}\n`
    )
  }
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

  activeController = new AbortController()
  startSpinner('Connecting to Brok Code…')
  let response
  try {
    response = await fetch(new URL('/api/brokcode/execute', syncBaseUrl), {
      method: 'POST',
      signal: activeController.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        command: content,
        model,
        source: 'tui',
        session_id: sessionId,
        project_id: activeProjectId || undefined,
        stream: true,
        [requireCloudRuntimeField]: requireCloudRuntime,
        prefer_pi: !requireCloudRuntime,
        max_tokens: 1200,
        messages
      })
    })
  } catch (error) {
    stopSpinner()
    if (error.name === 'AbortError') {
      output.write(`${colors.yellow}Cancelled.${colors.reset}\n`)
    } else {
      output.write(
        `${colors.red}request failed: ${error.message}${colors.reset}\n`
      )
    }
    return
  }
  stopSpinner()

  if (!response.ok || !response.body) {
    const { message, hint } = classifyError({
      status: response.status,
      body: await response.json().catch(() => null),
      fallback: `request failed: ${response.status}`
    })
    output.write(`${colors.red}${message}${colors.reset}\n`)
    if (hint) {
      output.write(`${colors.dim}${hint}${colors.reset}\n`)
    }
    return
  }

  activeTaskId =
    response.headers.get('x-brokcode-task-id') ||
    new URL(response.url).searchParams.get('task_id') ||
    ''

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let assistant = ''
  let resultContent = ''
  let previewUrl = ''
  let generatedFiles = []
  let currentEvent = 'message'
  let streamFailed = false
  let lastPhase = ''

  const onAbort = () => {
    output.write(`${colors.yellow}\nCancelled by user.${colors.reset}\n`)
    streamFailed = true
    activeController = null
    try {
      reader.cancel()
    } catch {}
  }
  process.once('SIGINT', onAbort)

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const { blocks, remaining } = chunkSseBlocks(buffer)
      buffer = remaining

      for (const block of blocks) {
        currentEvent = block.event
        if (block.done) continue
        const payload = block.data
        if (!payload) continue

        if (currentEvent === 'error' || payload.error) {
          streamFailed = true
          const errorMessage = normalizeRuntimeBrand(
            payload.error?.message ||
              payload.message ||
              'Brok Code stream failed'
          )
          output.write(`${colors.red}${errorMessage}${colors.reset}\n`)
          continue
        }

        if (currentEvent === 'status') {
          const phase = formatPhaseLabel(
            payload.phase || payload.status || payload.message
          )
          if (phase && phase !== lastPhase) {
            lastPhase = phase
            output.write(`${colors.dim}[${phase}]${colors.reset} `)
          } else if (payload.message) {
            output.write(
              `${colors.dim}${normalizeRuntimeBrand(payload.message)}${colors.reset}\n`
            )
          }
          continue
        }

        if (currentEvent === 'task' && payload.task_id) {
          activeTaskId = payload.task_id
          if (payload.status_url) {
            output.write(
              `${colors.dim}task ${payload.task_id} — ${payload.status_url}${colors.reset}\n`
            )
          }
          continue
        }

        if (currentEvent === 'files' && Array.isArray(payload.files)) {
          generatedFiles = payload.files.map(file => file?.path).filter(Boolean)
          output.write(
            `\n${colors.green}Saved files:${colors.reset} ${generatedFiles.join(', ')}\n`
          )
          continue
        }

        if (currentEvent === 'preview' && payload.preview_url) {
          previewUrl = payload.preview_url
          output.write(`${colors.green}Preview:${colors.reset} ${previewUrl}\n`)
          continue
        }

        if (payload.runtime && typeof payload.content === 'string') {
          resultContent = payload.content
          if (payload.preview_url) previewUrl = payload.preview_url
          if (Array.isArray(payload.generated_files)) {
            generatedFiles = payload.generated_files
          }
          continue
        }

        const delta = payload.content || payload.choices?.[0]?.delta?.content
        if (delta) {
          assistant += delta
          output.write(delta)
        }
      }
    }
  } catch (error) {
    streamFailed = true
    if (error.name === 'AbortError') {
      output.write(`${colors.yellow}Cancelled.${colors.reset}\n`)
    } else {
      output.write(
        `${colors.red}stream error: ${error.message}${colors.reset}\n`
      )
    }
  } finally {
    process.removeListener('SIGINT', onAbort)
    activeController = null
  }

  if (!assistant && resultContent) {
    assistant = resultContent
    output.write(resultContent)
  }

  output.write('\n\n')
  if (generatedFiles.length > 0) {
    output.write(
      `${colors.green}Generated:${colors.reset} ${generatedFiles.join(', ')}\n`
    )
  }
  if (previewUrl) {
    output.write(`${colors.green}Preview URL:${colors.reset} ${previewUrl}\n`)
  }
  if (activeTaskId) {
    output.write(
      `${colors.dim}Task: ${activeTaskId} — resume with /resume${colors.reset}\n`
    )
  }
  if (streamFailed) return

  messages.push({ role: 'assistant', content: assistant })
  await syncEvent({
    role: 'assistant',
    content: assistant || '(no assistant output)',
    type: 'response',
    metadata: {
      model,
      cwd: process.cwd(),
      taskId: activeTaskId || undefined
    }
  })
}

async function promptLine(text) {
  const rl = createInterface({ input, output })
  try {
    return await rl.question(text)
  } catch {
    return ''
  } finally {
    rl.close()
  }
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

  if (onceCommand) {
    const text = onceCommand.trim()
    if (!text) return
    if (text.startsWith('/')) {
      await handleCommand(text)
    } else {
      await sendChat(text)
    }
    return
  }

  const historyLines = loadHistory()
  const rl = createInterface({
    input,
    output,
    history: historyLines,
    historySize: 500,
    completer: buildReadlineCompleter()
  })

  // First Ctrl+C cancels the in-flight request; second one exits the TUI.
  let sigintCount = 0
  process.on('SIGINT', () => {
    if (activeController) {
      activeController.abort()
      sigintCount = 0
      return
    }
    sigintCount += 1
    if (sigintCount >= 2) {
      output.write(`\n${colors.dim}Bye.${colors.reset}\n`)
      rl.close()
      process.exit(0)
    }
    output.write(`\n${colors.dim}Press Ctrl+C again to exit.${colors.reset}\n`)
    rl.prompt()
  })

  while (true) {
    let prompt
    try {
      prompt = await rl.question(
        `${colors.bold}${colors.green}brok-code>${colors.reset} `
      )
    } catch (error) {
      if (error && error.code === 'ABORT_ERR') {
        continue
      }
      break
    }
    const text = prompt.trim()
    if (!text) continue
    sigintCount = 0
    if (text === '/exit' || text === '/quit') break
    if (text.startsWith('/')) {
      await handleCommand(text)
    } else {
      await sendChat(text)
    }
    appendHistory(text)
  }

  rl.close()
}

main().catch(error => {
  stopSpinner()
  output.write(`${colors.red}${error.message}${colors.reset}\n`)
  process.exitCode = 1
})
