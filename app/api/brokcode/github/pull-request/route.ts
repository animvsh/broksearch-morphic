import { NextRequest, NextResponse } from 'next/server'

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { unauthorizedResponse } from '@/lib/brok/auth'
import {
  enforceBrokCodeAccountOwnership,
  verifyBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'
import {
  isComposioConfigured,
  listConnectedAccounts
} from '@/lib/integrations/composio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const execFileAsync = promisify(execFile)

type GithubPullRequestResponse = {
  html_url?: string
  number?: number
  title?: string
  state?: string
}

function sanitizeRepository(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/^https?:\/\/github\.com\//i, '')
  const cleaned = trimmed.replace(/\.git$/i, '').replace(/^\/+/, '')
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cleaned)) {
    return null
  }
  return cleaned
}

function sanitizeBranch(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed || fallback
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

async function createPullRequestWithGhCli(params: {
  repository: string
  title: string
  body: string
  base: string
  head: string
  draft: boolean
}) {
  const args = [
    'pr',
    'create',
    '--repo',
    params.repository,
    '--title',
    params.title,
    '--body',
    params.body || 'Opened by Brok Code Cloud.',
    '--base',
    params.base,
    '--head',
    params.head
  ]

  if (params.draft) {
    args.push('--draft')
  }

  const { stdout, stderr } = await execFileAsync('gh', args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GH_PROMPT_DISABLED: '1'
    },
    timeout: 20_000
  })

  const combinedOutput = `${stdout}\n${stderr}`
  const urlMatch = combinedOutput.match(
    /https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+/i
  )
  const pullUrl = urlMatch?.[0] ?? null
  const numberMatch = pullUrl?.match(/\/pull\/(\d+)$/)
  const pullNumber = numberMatch?.[1]
    ? Number.parseInt(numberMatch[1], 10)
    : null

  return {
    number:
      pullNumber !== null && Number.isFinite(pullNumber) ? pullNumber : null,
    url: pullUrl,
    title: params.title,
    state: 'open'
  }
}

export async function POST(request: NextRequest) {
  const { authResult } = await verifyBrokCodeRequestAuth(request)
  if (!authResult.success) {
    return unauthorizedResponse(authResult)
  }
  const accountMismatch = await enforceBrokCodeAccountOwnership(authResult)
  if (accountMismatch) return accountMismatch

  const body = await request.json().catch(() => null)
  const repository = sanitizeRepository(body?.repository)
  const title =
    typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : ''
  const prBody =
    typeof body?.body === 'string' ? body.body.trim().slice(0, 65_000) : ''
  const base = sanitizeBranch(body?.base, 'main')
  const head = sanitizeBranch(body?.head, '')
  const draft = body?.draft === true

  if (!repository || !title || !head) {
    return jsonNoStore(
      {
        error: {
          type: 'invalid_request_error',
          message: 'repository, title, and head branch are required.'
        }
      },
      { status: 400 }
    )
  }

  if (isComposioConfigured()) {
    try {
      const accounts = await listConnectedAccounts(
        authResult.apiKey.userId,
        'github',
        20
      )
      const connected = accounts.some(account => {
        const status = account.status?.toLowerCase()
        return !status || ['active', 'connected', 'enabled'].includes(status)
      })

      if (!connected) {
        return jsonNoStore(
          {
            error: {
              type: 'integration_error',
              message:
                'GitHub is not connected for this user. Connect GitHub first from Brok Code.'
            }
          },
          { status: 412 }
        )
      }
    } catch (error) {
      return jsonNoStore(
        {
          error: {
            type: 'integration_error',
            message:
              error instanceof Error
                ? error.message
                : 'Could not verify GitHub integration state.'
          }
        },
        { status: 502 }
      )
    }
  }

  const githubToken =
    process.env.BROKCODE_GITHUB_TOKEN?.trim() ||
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.GITHUB_ACCESS_TOKEN?.trim()

  if (!githubToken) {
    try {
      const pullRequest = await createPullRequestWithGhCli({
        repository,
        title,
        body: prBody,
        base,
        head,
        draft
      })

      return jsonNoStore({
        pullRequest: {
          ...pullRequest,
          repository,
          base,
          head
        }
      })
    } catch (error) {
      return jsonNoStore(
        {
          error: {
            type: 'configuration_error',
            message:
              error instanceof Error
                ? `GitHub PR submission is not configured. Set BROKCODE_GITHUB_TOKEN or sign in with gh CLI. ${error.message}`
                : 'GitHub PR submission is not configured. Set BROKCODE_GITHUB_TOKEN or sign in with gh CLI.'
          }
        },
        { status: 503 }
      )
    }
  }

  const response = await fetch(
    `https://api.github.com/repos/${repository}/pulls`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${githubToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title,
        body: prBody || undefined,
        base,
        head,
        draft
      })
    }
  )

  const payload = (await response.json().catch(() => null)) as
    | GithubPullRequestResponse
    | { message?: string }
    | null

  if (!response.ok) {
    return jsonNoStore(
      {
        error: {
          type: 'github_error',
          message:
            payload &&
            'message' in payload &&
            typeof payload.message === 'string'
              ? payload.message
              : `GitHub PR creation failed (${response.status}).`
        }
      },
      { status: 502 }
    )
  }

  const pullRequestPayload =
    payload &&
    typeof payload === 'object' &&
    ('html_url' in payload || 'number' in payload)
      ? (payload as GithubPullRequestResponse)
      : null

  return jsonNoStore({
    pullRequest: {
      number: pullRequestPayload?.number ?? null,
      url: pullRequestPayload?.html_url ?? null,
      title: pullRequestPayload?.title ?? title,
      state: pullRequestPayload?.state ?? 'open',
      repository,
      base,
      head
    }
  })
}
