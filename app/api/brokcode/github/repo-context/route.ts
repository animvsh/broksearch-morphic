import { NextRequest, NextResponse } from 'next/server'

import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { unauthorizedResponse } from '@/lib/brok/auth'
import {
  enforceBrokCodeAccountOwnership,
  verifyBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)

function parseRepositoryFromRemote(remoteUrl: string) {
  const normalized = remoteUrl.trim()
  if (!normalized) return null

  const sshMatch = normalized.match(
    /^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i
  )
  if (sshMatch?.[1]) {
    return sshMatch[1]
  }

  const sshProtocolMatch = normalized.match(
    /^ssh:\/\/git@github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/i
  )
  if (sshProtocolMatch?.[1]) {
    return sshProtocolMatch[1]
  }

  try {
    const parsed = new URL(normalized)
    if (parsed.hostname.toLowerCase() !== 'github.com') {
      return null
    }

    const path = parsed.pathname.replace(/^\/+/, '').replace(/\.git$/, '')
    const parts = path.split('/').filter(Boolean)
    if (parts.length < 2) return null
    return `${parts[0]}/${parts[1]}`
  } catch {
    return null
  }
}

async function gitOutput(args: string[], cwd: string) {
  const { stdout } = await execFileAsync('git', args, { cwd })
  return stdout.trim()
}

async function resolveRemoteName(cwd: string) {
  try {
    const remotes = await gitOutput(['remote'], cwd)
    const names = remotes
      .split(/\r?\n/g)
      .map(line => line.trim())
      .filter(Boolean)

    if (names.length === 0) return null
    if (names.includes('origin')) return 'origin'
    return names[0] || null
  } catch {
    return null
  }
}

async function resolveGitWorkingDirectory() {
  const configured = process.env.BROKCODE_GIT_DIR?.trim()
  if (configured) return configured

  let current = process.cwd()
  while (true) {
    try {
      await access(path.join(current, '.git'))
      return current
    } catch {}

    const parent = path.dirname(current)
    if (parent === current) {
      return process.cwd()
    }
    current = parent
  }
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export async function GET(request: NextRequest) {
  const { authResult } = await verifyBrokCodeRequestAuth(request)
  if (!authResult.success) {
    return unauthorizedResponse(authResult)
  }
  const accountMismatch = await enforceBrokCodeAccountOwnership(authResult)
  if (accountMismatch) return accountMismatch

  const cwd = await resolveGitWorkingDirectory()

  try {
    const remoteName = await resolveRemoteName(cwd)
    if (!remoteName) {
      throw new Error('No git remotes were found in this repository.')
    }

    const [remoteUrl, currentBranch, commitSha] = await Promise.all([
      gitOutput(['remote', 'get-url', remoteName], cwd),
      gitOutput(['branch', '--show-current'], cwd),
      gitOutput(['rev-parse', 'HEAD'], cwd)
    ])

    let defaultBranch = 'main'
    try {
      defaultBranch = await gitOutput(
        ['symbolic-ref', `refs/remotes/${remoteName}/HEAD`],
        cwd
      )
      defaultBranch = defaultBranch.replace(
        new RegExp(`^refs/remotes/${remoteName}/`),
        ''
      )
    } catch {}

    return jsonNoStore({
      repository:
        parseRepositoryFromRemote(remoteUrl) ||
        process.env.BROKCODE_DEFAULT_REPOSITORY ||
        null,
      remoteUrl,
      currentBranch: currentBranch || null,
      defaultBranch,
      commitSha: commitSha || null
    })
  } catch (error) {
    return jsonNoStore({
      repository: process.env.BROKCODE_DEFAULT_REPOSITORY || null,
      remoteUrl: null,
      currentBranch: null,
      defaultBranch: 'main',
      commitSha: null,
      message:
        error instanceof Error
          ? error.message
          : 'Could not resolve git repository context.'
    })
  }
}
