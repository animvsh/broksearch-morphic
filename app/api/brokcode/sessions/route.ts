import { NextRequest, NextResponse } from 'next/server'

import { unauthorizedResponse } from '@/lib/brok/auth'
import {
  enforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'
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

function filterSessionForWorkspace<
  T extends Awaited<ReturnType<typeof getBrokCodeSession>>
>(session: T, workspaceId: string): T {
  if (!session) return session

  const events = session.events.filter(
    event => event.metadata?.workspaceId === workspaceId
  )
  if (events.length === 0) return null as T

  const sources = Array.from(new Set(events.map(event => event.source)))

  return {
    ...session,
    sources,
    events,
    title: events[0]?.content.trim().slice(0, 72) || session.title,
    createdAt: events[0]?.createdAt ?? session.createdAt,
    updatedAt: events[events.length - 1]?.createdAt ?? session.updatedAt
  } as T
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init)
  response.headers.set('Cache-Control', 'no-store')
  return response
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

  const sessionId = request.nextUrl.searchParams.get('session_id')
  if (sessionId) {
    const session = await getBrokCodeSession(sessionId, authResult.workspace.id)
    return jsonNoStore({
      session: filterSessionForWorkspace(session, authResult.workspace.id)
    })
  }

  const sessions = (
    await listBrokCodeSessions({
      workspaceId: authResult.workspace.id
    })
  )
    .map(session => filterSessionForWorkspace(session, authResult.workspace.id))
    .filter(session => Boolean(session))
  return jsonNoStore({ sessions })
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
    sessionId:
      typeof body?.session_id === 'string' ? body.session_id : 'default',
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
