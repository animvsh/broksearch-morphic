import { NextRequest, NextResponse } from 'next/server'

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { unauthorizedResponse } from '@/lib/brok/auth'
import {
  enforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'
import {
  normalizeGithubRepositoryList,
  parseGithubNextLink
} from '@/lib/brokcode/github-repositories'
import {
  executeComposioTool,
  isComposioConfigured,
  listConnectedAccounts
} from '@/lib/integrations/composio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)

const DEFAULT_COMPOSIO_REPOSITORY_TOOLS = [
  'GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER',
  'GITHUB_LIST_REPOSITORIES_FOR_AUTHENTICATED_USER',
  'GITHUB_LIST_REPOS_FOR_AUTHENTICATED_USER'
]

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

function parseComposioRepositoryToolSlugs() {
  const raw = process.env.COMPOSIO_GITHUB_LIST_REPOSITORIES_TOOL_SLUGS?.trim()
  if (!raw) return DEFAULT_COMPOSIO_REPOSITORY_TOOLS

  return raw
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
}

async function resolveGhCliToken() {
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        GH_PROMPT_DISABLED: '1'
      },
      timeout: 10_000
    })
    return stdout.trim() || null
  } catch {
    return null
  }
}

async function resolveGithubToken(allowGhCli: boolean) {
  const envToken =
    process.env.BROKCODE_GITHUB_TOKEN?.trim() ||
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.GITHUB_ACCESS_TOKEN?.trim()

  if (envToken) return envToken
  return allowGhCli ? resolveGhCliToken() : null
}

async function listRepositoriesWithGithubToken(token: string) {
  const repositories: unknown[] = []
  let nextUrl: string | null =
    'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member'

  for (let page = 0; nextUrl && page < 5; page += 1) {
    const response = await fetch(nextUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      const message =
        payload && typeof payload === 'object' && 'message' in payload
          ? String(payload.message)
          : `GitHub repository lookup failed (${response.status}).`
      throw new Error(message)
    }

    if (Array.isArray(payload)) repositories.push(...payload)
    nextUrl = parseGithubNextLink(response.headers.get('link'))
  }

  return normalizeGithubRepositoryList(repositories)
}

async function listRepositoriesWithComposio({
  userId,
  connectedAccountId
}: {
  userId: string
  connectedAccountId?: string
}) {
  const failures: string[] = []

  for (const toolSlug of parseComposioRepositoryToolSlugs()) {
    try {
      const payload = await executeComposioTool({
        toolSlug,
        userId,
        connectedAccountId,
        arguments: {
          per_page: 100,
          sort: 'updated',
          affiliation: 'owner,collaborator,organization_member'
        }
      })
      const repositories = normalizeGithubRepositoryList(payload)
      if (repositories.length > 0) return { repositories, toolSlug }
    } catch (error) {
      failures.push(
        `${toolSlug}: ${
          error instanceof Error ? error.message : 'Composio tool failed.'
        }`
      )
    }
  }

  throw new Error(
    failures.length
      ? failures.join(' | ')
      : 'No Composio GitHub repository list tool slug is configured.'
  )
}

export async function GET(request: NextRequest) {
  const { authResult } = await resolveBrokCodeRequestAuth(request, {
    allowBrowserSession: true
  })
  if (!authResult.success) {
    return unauthorizedResponse(authResult)
  }
  const accountMismatch = await enforceBrokCodeAccountOwnership(authResult)
  if (accountMismatch) return accountMismatch

  const isBrowserSession =
    'isBrowserSession' in authResult && authResult.isBrowserSession === true
  const githubToken = await resolveGithubToken(
    !isBrowserSession ||
      process.env.BROKCODE_ALLOW_BROWSER_GH_CLI_EXPORT === 'true'
  )

  if (githubToken) {
    try {
      const repositories = await listRepositoriesWithGithubToken(githubToken)
      return jsonNoStore({
        repositories,
        provider: 'github-token',
        connected: true
      })
    } catch (error) {
      return jsonNoStore(
        {
          repositories: [],
          provider: 'github-token',
          connected: false,
          message:
            error instanceof Error
              ? error.message
              : 'Could not load GitHub repositories.'
        },
        { status: 502 }
      )
    }
  }

  if (isComposioConfigured()) {
    const accounts = await listConnectedAccounts(
      authResult.apiKey.userId,
      'github',
      20
    )
    const connectedAccount = accounts.find(account => {
      const status = account.status?.toLowerCase()
      return !status || ['active', 'connected', 'enabled'].includes(status)
    })

    if (!connectedAccount) {
      return jsonNoStore(
        {
          repositories: [],
          provider: 'composio',
          connected: false,
          message: 'Connect GitHub before loading repositories.'
        },
        { status: 412 }
      )
    }

    try {
      const result = await listRepositoriesWithComposio({
        userId: authResult.apiKey.userId,
        connectedAccountId: connectedAccount.id
      })
      return jsonNoStore({
        repositories: result.repositories,
        provider: 'composio',
        toolSlug: result.toolSlug,
        connected: true
      })
    } catch (error) {
      return jsonNoStore(
        {
          repositories: [],
          provider: 'composio',
          connected: false,
          message:
            error instanceof Error
              ? error.message
              : 'Could not load GitHub repositories through Composio.'
        },
        { status: 502 }
      )
    }
  }

  return jsonNoStore({
    repositories: [],
    provider: 'none',
    connected: false,
    message:
      'GitHub repository listing needs a connected GitHub account or a configured GitHub token.'
  })
}
