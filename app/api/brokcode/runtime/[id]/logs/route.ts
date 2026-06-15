import { NextResponse } from 'next/server'

import {
  enforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'
import {
  appendBrokCodeRuntimeBrowserEvent,
  getBrokCodeRuntimeDiagnostics
} from '@/lib/brokcode/runtime/process-manager'
import { getBrokCodeRuntimeSandboxById } from '@/lib/brokcode/runtime/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function authorizeRuntime(request: Request, id: string) {
  const { authResult } = await resolveBrokCodeRequestAuth(request, {
    allowBrowserSession: true
  })
  if (!authResult.success) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }
  }

  const accountMismatch = await enforceBrokCodeAccountOwnership(authResult)
  if (accountMismatch) {
    return { ok: false as const, response: accountMismatch }
  }

  const runtime = await getBrokCodeRuntimeSandboxById({ id })
  if (
    !runtime ||
    runtime.workspaceId !== authResult.workspace.id ||
    runtime.userId !== authResult.apiKey.userId
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Runtime not found' },
        { status: 404 }
      )
    }
  }

  return { ok: true as const, runtime }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await authorizeRuntime(request, id)
  if (!access.ok) return access.response

  return NextResponse.json({
    diagnostics: getBrokCodeRuntimeDiagnostics(access.runtime),
    runtime: access.runtime
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await authorizeRuntime(request, id)
  if (!access.ok) return access.response

  const event = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  if (!event || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid log event.' }, { status: 400 })
  }

  const logs = await appendBrokCodeRuntimeBrowserEvent({
    runtime: access.runtime,
    event
  })

  return NextResponse.json({
    logs,
    diagnostics: getBrokCodeRuntimeDiagnostics(access.runtime)
  })
}
