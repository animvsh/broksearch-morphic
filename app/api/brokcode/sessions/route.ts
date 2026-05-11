import { NextRequest, NextResponse } from 'next/server'

import { unauthorizedResponse, verifyRequestAuth } from '@/lib/brok/auth'
import { enforceBrokCodeAccountOwnership } from '@/lib/brokcode/account-guard'
import {
  appendBrokCodeSessionEvent,
  BrokCodeSessionRole,
  BrokCodeSessionSource,
  getBrokCodeSession,
  listBrokCodeSessions
} from '@/lib/brokcode/session-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_SOURCES = new Set<BrokCodeSessionSource>(['cloud', 'tui', 'api'])
const VALID_ROLES = new Set<BrokCodeSessionRole>([
  'user',
  'assistant',
  'system'
])

function sessionBelongsToWorkspace(
  session: Awaited<ReturnType<typeof getBrokCodeSession>>,
  workspaceId: string
) {
  return Boolean(
    session?.events.some(event => event.metadata?.workspaceId === workspaceId)
  )
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export async function GET(request: NextRequest) {
  const authResult = await verifyRequestAuth(request)
  if (!authResult.success) {
    return unauthorizedResponse(authResult)
  }
  const accountMismatch = await enforceBrokCodeAccountOwnership(authResult)
  if (accountMismatch) return accountMismatch

  const sessionId = request.nextUrl.searchParams.get('session_id')
  if (sessionId) {
    const session = await getBrokCodeSession(sessionId)
    return jsonNoStore({
      session: sessionBelongsToWorkspace(session, authResult.workspace.id)
        ? session
        : null
    })
  }

  const sessions = (await listBrokCodeSessions()).filter(session =>
    sessionBelongsToWorkspace(session, authResult.workspace.id)
  )
  return jsonNoStore({ sessions })
}

export async function POST(request: NextRequest) {
  const authResult = await verifyRequestAuth(request)
  if (!authResult.success) {
    return unauthorizedResponse(authResult)
  }
  const accountMismatch = await enforceBrokCodeAccountOwnership(authResult)
  if (accountMismatch) return accountMismatch

  const body = await request.json().catch(() => null)
  const content = typeof body?.content === 'string' ? body.content.trim() : ''

  if (!content) {
    return jsonNoStore(
      {
        error: {
          type: 'invalid_request_error',
          message: 'content is required.'
        }
      },
      { status: 400 }
    )
  }

  const source = VALID_SOURCES.has(body?.source) ? body.source : 'api'
  const role = VALID_ROLES.has(body?.role) ? body.role : 'system'
  const metadata =
    body?.metadata && typeof body.metadata === 'object'
      ? (body.metadata as Record<string, unknown>)
      : undefined

  const session = await appendBrokCodeSessionEvent({
    sessionId: typeof body?.session_id === 'string' ? body.session_id : 'default',
    source,
    role,
    type: typeof body?.type === 'string' ? body.type : 'message',
    title: typeof body?.title === 'string' ? body.title : undefined,
    content,
    metadata: {
      ...metadata,
      workspaceId: authResult.workspace.id,
      userId: authResult.apiKey.userId,
      apiKeyId: authResult.apiKey.id
    }
  })

  return jsonNoStore({ session })
}
