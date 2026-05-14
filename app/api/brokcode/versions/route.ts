import { NextRequest, NextResponse } from 'next/server'

import { unauthorizedResponse } from '@/lib/brok/auth'
import {
  enforceBrokCodeAccountOwnership,
  verifyBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'
import {
  createBrokCodeVersion,
  listBrokCodeVersions
} from '@/lib/brokcode/version-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

  const sessionId = request.nextUrl.searchParams.get('session_id') ?? undefined
  const versions = await listBrokCodeVersions({
    sessionId,
    workspaceId: authResult.workspace.id
  })
  return jsonNoStore({ versions })
}

export async function POST(request: NextRequest) {
  const { authResult } = await verifyBrokCodeRequestAuth(request)
  if (!authResult.success) {
    return unauthorizedResponse(authResult)
  }
  const accountMismatch = await enforceBrokCodeAccountOwnership(authResult)
  if (accountMismatch) return accountMismatch

  const body = await request.json().catch(() => null)
  const command =
    typeof body?.command === 'string' ? body.command.trim() : undefined
  const summary =
    typeof body?.summary === 'string' ? body.summary.trim() : undefined
  const runtime =
    body?.runtime === 'pi' ||
    body?.runtime === 'opencode' ||
    body?.runtime === 'brok'
      ? body.runtime
      : 'not_connected'
  const status = body?.status === 'error' ? 'error' : 'done'

  if (!command || !summary) {
    return jsonNoStore(
      {
        error: {
          type: 'invalid_request_error',
          message: 'command and summary are required.'
        }
      },
      { status: 400 }
    )
  }

  const version = await createBrokCodeVersion({
    sessionId:
      typeof body?.session_id === 'string' ? body.session_id : 'default',
    workspaceId: authResult.workspace.id,
    userId: authResult.apiKey.userId,
    command,
    summary,
    runtime,
    status,
    previewUrl: typeof body?.preview_url === 'string' ? body.preview_url : null,
    branch: typeof body?.branch === 'string' ? body.branch : null,
    commitSha: typeof body?.commit_sha === 'string' ? body.commit_sha : null,
    prUrl: typeof body?.pr_url === 'string' ? body.pr_url : null
  })

  return jsonNoStore({ version })
}
