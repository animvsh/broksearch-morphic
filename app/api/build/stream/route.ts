import { NextResponse } from 'next/server'

import { startBrokBuild } from '@/lib/actions/build'
import { requireFeatureAccessForApi } from '@/lib/auth/app-access'
import {
  enforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'
import type { BrokStreamEvent } from '@/lib/build/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no'
}

function encode(event: BrokStreamEvent) {
  return `event: brok\ndata: ${JSON.stringify(event)}\n\n`
}

function isCloudLikeBuildRuntime() {
  return (
    process.env.BROK_CLOUD_DEPLOYMENT === 'true' ||
    process.env.MORPHIC_CLOUD_DEPLOYMENT === 'true' ||
    process.env.NODE_ENV === 'production'
  )
}

function requiresBrokCodeExecution(value: unknown) {
  if (isCloudLikeBuildRuntime()) return true
  return value === true
}

export async function POST(request: Request) {
  const access = await requireFeatureAccessForApi('brokcode')
  if (!access.ok) return access.response

  let body: {
    prompt?: unknown
    projectId?: unknown
    require_brokcode_execution?: unknown
  } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400 }
    )
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt) {
    return NextResponse.json(
      { error: 'A non-empty prompt is required.' },
      { status: 400 }
    )
  }
  if (prompt.length > 4000) {
    return NextResponse.json(
      { error: 'Prompt is too long (max 4000 chars).' },
      { status: 400 }
    )
  }

  const { authResult } = await resolveBrokCodeRequestAuth(request, {
    allowBrowserSession: true
  })
  const accountMismatch = authResult.success
    ? await enforceBrokCodeAccountOwnership(authResult)
    : null
  if (accountMismatch) return accountMismatch
  if (!authResult.success && isCloudLikeBuildRuntime()) {
    return NextResponse.json(
      {
        error: {
          type: 'authentication_error',
          code: authResult.error,
          message:
            'Brok Build requires BrokCode project authentication in production. Sign in with BrokCode access or provide a code:write Brok API key.'
        }
      },
      { status: authResult.status }
    )
  }
  const brokCodeProject =
    authResult.success && !accountMismatch
      ? {
          workspaceId: authResult.workspace.id,
          userId: authResult.apiKey.userId,
          request,
          requireBrokCodeExecution: requiresBrokCodeExecution(
            body.require_brokcode_execution
          )
        }
      : undefined

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await startBrokBuild({
          prompt,
          projectId:
            typeof body.projectId === 'string' && body.projectId.length > 0
              ? body.projectId
              : undefined,
          emit: event => {
            controller.enqueue(encoder.encode(encode(event)))
          },
          brokCodeProject
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Build stream failed.'
        controller.enqueue(
          encoder.encode(
            encode({ kind: 'error', message } satisfies BrokStreamEvent)
          )
        )
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
