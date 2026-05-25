import { NextRequest, NextResponse } from 'next/server'

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { unauthorizedResponse } from '@/lib/brok/auth'
import {
  enforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'
import {
  type BrokCodeGithubExportFile,
  buildGithubExportBranchName,
  buildGithubExportCommitMessage,
  buildGithubExportPullRequestBody,
  normalizeGithubExportFiles,
  sanitizeGithubExportPath
} from '@/lib/brokcode/github-export'
import {
  getBrokCodeProject,
  listBrokCodeProjectFiles
} from '@/lib/brokcode/project-store'
import {
  executeComposioTool,
  isComposioConfigured,
  listConnectedAccounts
} from '@/lib/integrations/composio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const execFileAsync = promisify(execFile)

type GithubPullRequestResponse = {
  html_url?: string
  url?: string
  number?: number
  title?: string
  state?: string
}

const DEFAULT_COMPOSIO_PULL_REQUEST_TOOLS = [
  'GITHUB_CREATE_A_PULL_REQUEST',
  'GITHUB_CREATE_PULL_REQUEST'
]

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

function encodeGitRef(ref: string) {
  return ref.split('/').map(encodeURIComponent).join('/')
}

async function githubApi<T>({
  token,
  repository,
  path,
  init
}: {
  token: string
  repository: string
  path: string
  init?: RequestInit
}) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/${path}`,
    {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        ...(init?.headers ?? {})
      }
    }
  )
  const payload = (await response.json().catch(() => null)) as T & {
    message?: string
  }

  if (!response.ok) {
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : `GitHub request failed (${response.status}).`
    throw new Error(message)
  }

  return payload
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

async function loadProjectExportFiles({
  projectId,
  workspaceId,
  userId,
  exportPath
}: {
  projectId: string
  workspaceId: string
  userId: string
  exportPath: string
}) {
  const project = await getBrokCodeProject({
    id: projectId,
    workspaceId,
    userId
  })

  if (!project) {
    throw new Error('BrokCode project was not found for this account.')
  }

  const files = await listBrokCodeProjectFiles({
    projectId,
    workspaceId
  })
  const exportFiles = normalizeGithubExportFiles({
    exportPath,
    files: files.map(file => ({
      path: file.path,
      content: file.content
    }))
  })

  if (exportFiles.length === 0) {
    throw new Error('BrokCode project has no exportable files.')
  }

  return { project, files: exportFiles }
}

async function getGithubRef({
  token,
  repository,
  branch
}: {
  token: string
  repository: string
  branch: string
}) {
  try {
    return await githubApi<{ object?: { sha?: string } }>({
      token,
      repository,
      path: `git/ref/heads/${encodeGitRef(branch)}`
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Not Found') return null
    throw error
  }
}

async function commitFilesToGithubBranch({
  token,
  repository,
  base,
  head,
  message,
  files
}: {
  token: string
  repository: string
  base: string
  head: string
  message: string
  files: BrokCodeGithubExportFile[]
}) {
  if (base === head) {
    throw new Error('Head branch must be different from base branch.')
  }

  const baseRef = await getGithubRef({ token, repository, branch: base })
  const baseSha = baseRef?.object?.sha
  if (!baseSha) {
    throw new Error(`Base branch ${base} was not found.`)
  }

  const headRef = await getGithubRef({ token, repository, branch: head })
  const parentSha = headRef?.object?.sha ?? baseSha
  const parentCommit = await githubApi<{ tree?: { sha?: string } }>({
    token,
    repository,
    path: `git/commits/${parentSha}`
  })
  const baseTree = parentCommit.tree?.sha
  if (!baseTree) {
    throw new Error('Could not resolve the GitHub base tree.')
  }

  const blobs = await Promise.all(
    files.map(async file => {
      const blob = await githubApi<{ sha?: string }>({
        token,
        repository,
        path: 'git/blobs',
        init: {
          method: 'POST',
          body: JSON.stringify({
            content: file.content,
            encoding: 'utf-8'
          })
        }
      })
      if (!blob.sha) {
        throw new Error(`GitHub did not return a blob for ${file.path}.`)
      }
      return { file, sha: blob.sha }
    })
  )

  const tree = await githubApi<{ sha?: string }>({
    token,
    repository,
    path: 'git/trees',
    init: {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseTree,
        tree: blobs.map(({ file, sha }) => ({
          path: file.path,
          mode: '100644',
          type: 'blob',
          sha
        }))
      })
    }
  })
  if (!tree.sha) {
    throw new Error('GitHub did not return a tree for the export.')
  }

  const commit = await githubApi<{ sha?: string; html_url?: string }>({
    token,
    repository,
    path: 'git/commits',
    init: {
      method: 'POST',
      body: JSON.stringify({
        message,
        tree: tree.sha,
        parents: [parentSha]
      })
    }
  })
  if (!commit.sha) {
    throw new Error('GitHub did not return a commit for the export.')
  }

  if (headRef) {
    await githubApi({
      token,
      repository,
      path: `git/refs/heads/${encodeGitRef(head)}`,
      init: {
        method: 'PATCH',
        body: JSON.stringify({
          sha: commit.sha,
          force: false
        })
      }
    })
  } else {
    await githubApi({
      token,
      repository,
      path: 'git/refs',
      init: {
        method: 'POST',
        body: JSON.stringify({
          ref: `refs/heads/${head}`,
          sha: commit.sha
        })
      }
    })
  }

  return {
    commitSha: commit.sha,
    commitUrl: commit.html_url ?? null,
    filesCommitted: files.length,
    branchCreated: !headRef
  }
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

function parseComposioToolSlugs() {
  const raw = process.env.COMPOSIO_GITHUB_CREATE_PULL_REQUEST_TOOL_SLUGS?.trim()
  if (!raw) return DEFAULT_COMPOSIO_PULL_REQUEST_TOOLS

  return raw
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
}

function asRecord(value: unknown) {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

function findPullRequestPayload(
  payload: unknown
): GithubPullRequestResponse | null {
  const root = asRecord(payload)
  if (!root) return null

  const data = asRecord(root.data)
  const nestedData = asRecord(data?.data)
  const candidates = [
    root,
    data,
    asRecord(root.result),
    asRecord(root.output),
    nestedData,
    asRecord(data?.pull_request),
    asRecord(data?.pullRequest),
    asRecord(nestedData?.pull_request),
    asRecord(nestedData?.pullRequest)
  ].filter(Boolean) as Record<string, unknown>[]

  for (const candidate of candidates) {
    const url =
      typeof candidate.html_url === 'string'
        ? candidate.html_url
        : typeof candidate.url === 'string'
          ? candidate.url
          : null
    const number =
      typeof candidate.number === 'number'
        ? candidate.number
        : typeof candidate.pull_number === 'number'
          ? candidate.pull_number
          : null

    if (url || number) {
      return {
        html_url: url ?? undefined,
        url: url ?? undefined,
        number: number ?? undefined,
        title:
          typeof candidate.title === 'string' ? candidate.title : undefined,
        state: typeof candidate.state === 'string' ? candidate.state : undefined
      }
    }
  }

  return null
}

async function createPullRequestWithComposio(params: {
  userId: string
  connectedAccountId?: string
  repository: string
  title: string
  body: string
  base: string
  head: string
  draft: boolean
}) {
  const [owner, repo] = params.repository.split('/')
  const failures: string[] = []

  for (const toolSlug of parseComposioToolSlugs()) {
    try {
      const payload = await executeComposioTool({
        toolSlug,
        userId: params.userId,
        connectedAccountId: params.connectedAccountId,
        arguments: {
          owner,
          repo,
          title: params.title,
          body: params.body || undefined,
          base: params.base,
          head: params.head,
          draft: params.draft,
          maintainer_can_modify: true
        }
      })
      const pullRequestPayload = findPullRequestPayload(payload)

      return {
        number: pullRequestPayload?.number ?? null,
        url: pullRequestPayload?.html_url ?? pullRequestPayload?.url ?? null,
        title: pullRequestPayload?.title ?? params.title,
        state: pullRequestPayload?.state ?? 'open',
        toolSlug
      }
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
      : 'No Composio GitHub pull request tool slug is configured.'
  )
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

  const body = await request.json().catch(() => null)
  const repository = sanitizeRepository(body?.repository)
  const title =
    typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : ''
  const prBody =
    typeof body?.body === 'string' ? body.body.trim().slice(0, 65_000) : ''
  const base = sanitizeBranch(body?.base, 'main')
  const requestedHead = sanitizeBranch(body?.head, '')
  const draft = body?.draft === true
  const projectId =
    typeof body?.project_id === 'string' && body.project_id.trim()
      ? body.project_id.trim()
      : null
  const versionId =
    typeof body?.version_id === 'string' && body.version_id.trim()
      ? body.version_id.trim()
      : null
  const exportPath = sanitizeGithubExportPath(body?.export_path)

  if (!repository || !title) {
    return jsonNoStore(
      {
        error: {
          type: 'invalid_request_error',
          message: 'repository and title are required.'
        }
      },
      { status: 400 }
    )
  }

  let composioFailure: string | null = null
  let projectExport: Awaited<ReturnType<typeof loadProjectExportFiles>> | null =
    null

  if (projectId) {
    try {
      projectExport = await loadProjectExportFiles({
        projectId,
        workspaceId: authResult.workspace.id,
        userId: authResult.apiKey.userId,
        exportPath
      })
    } catch (error) {
      return jsonNoStore(
        {
          error: {
            type: 'invalid_request_error',
            message:
              error instanceof Error
                ? error.message
                : 'Could not load BrokCode project files.'
          }
        },
        { status: 400 }
      )
    }
  }

  const head =
    requestedHead ||
    buildGithubExportBranchName({
      projectName: projectExport?.project.name ?? title,
      projectId
    })
  const prBodyWithExport = projectExport
    ? buildGithubExportPullRequestBody({
        body: prBody,
        projectId,
        versionId,
        exportPath,
        files: projectExport.files
      })
    : prBody
  let exportCommit: {
    commitSha: string
    commitUrl: string | null
    filesCommitted: number
    branchCreated: boolean
  } | null = null

  const githubToken = await resolveGithubToken(
    !isBrowserSession ||
      process.env.BROKCODE_ALLOW_BROWSER_GH_CLI_EXPORT === 'true'
  )

  if (projectExport && githubToken) {
    try {
      exportCommit = await commitFilesToGithubBranch({
        token: githubToken,
        repository,
        base,
        head,
        message: buildGithubExportCommitMessage({ projectId, versionId }),
        files: projectExport.files
      })
    } catch (error) {
      return jsonNoStore(
        {
          error: {
            type: 'github_error',
            message:
              error instanceof Error
                ? error.message
                : 'Could not commit BrokCode project files to GitHub.'
          }
        },
        { status: 502 }
      )
    }
  }

  if (projectExport && !exportCommit) {
    return jsonNoStore(
      {
        error: {
          type: 'configuration_error',
          message:
            'GitHub file export requires BROKCODE_GITHUB_TOKEN, GITHUB_TOKEN, GITHUB_ACCESS_TOKEN, or gh CLI token access.'
        }
      },
      { status: 503 }
    )
  }

  if (isComposioConfigured() && !exportCommit) {
    try {
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
            error: {
              type: 'integration_error',
              message:
                'GitHub is not connected for this user. Connect GitHub first from Brok Code.'
            }
          },
          { status: 412 }
        )
      }

      const pullRequest = await createPullRequestWithComposio({
        userId: authResult.apiKey.userId,
        connectedAccountId: connectedAccount.id,
        repository,
        title,
        body: prBodyWithExport,
        base,
        head,
        draft
      })

      return jsonNoStore({
        pullRequest: {
          number: pullRequest.number,
          url: pullRequest.url,
          title: pullRequest.title,
          state: pullRequest.state,
          repository,
          base,
          head,
          provider: 'composio',
          toolSlug: pullRequest.toolSlug
        }
      })
    } catch (error) {
      composioFailure =
        error instanceof Error
          ? error.message
          : 'Could not create a GitHub pull request through Composio.'
    }
  }

  if (isBrowserSession && !exportCommit) {
    return jsonNoStore(
      {
        error: {
          type: 'integration_error',
          code: 'github_user_connection_required',
          message: composioFailure
            ? `Could not create the pull request through your connected GitHub account: ${composioFailure}`
            : 'Connect GitHub through BrokCode before opening a browser PR.'
        }
      },
      { status: isComposioConfigured() ? 502 : 412 }
    )
  }

  if (!githubToken) {
    try {
      const pullRequest = await createPullRequestWithGhCli({
        repository,
        title,
        body: prBodyWithExport,
        base,
        head,
        draft
      })

      return jsonNoStore({
        pullRequest: {
          ...pullRequest,
          repository,
          base,
          head,
          provider: 'gh-cli',
          export: exportCommit,
          composioWarning: composioFailure
        }
      })
    } catch (error) {
      return jsonNoStore(
        {
          error: {
            type: 'configuration_error',
            message:
              error instanceof Error
                ? `GitHub PR submission is not configured. Composio failed${
                    composioFailure ? `: ${composioFailure}` : ''
                  }. Set BROKCODE_GITHUB_TOKEN or sign in with gh CLI. ${error.message}`
                : `GitHub PR submission is not configured. Composio failed${
                    composioFailure ? `: ${composioFailure}` : ''
                  }. Set BROKCODE_GITHUB_TOKEN or sign in with gh CLI.`
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
        body: prBodyWithExport || undefined,
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
      head,
      provider: 'github-token',
      export: exportCommit,
      composioWarning: composioFailure
    }
  })
}
