import { NextResponse } from 'next/server'

import {
  appendBrokCodeRuntimeBrowserEvent,
  getBrokCodeRuntimeDiagnostics
} from '@/lib/brokcode/runtime/process-manager'
import { getBrokCodeRuntimeSandboxById } from '@/lib/brokcode/runtime/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const runtime = await getBrokCodeRuntimeSandboxById({ id })
  if (!runtime) {
    return NextResponse.json({ error: 'Runtime not found' }, { status: 404 })
  }

  return NextResponse.json({
    diagnostics: getBrokCodeRuntimeDiagnostics(runtime),
    runtime
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const runtime = await getBrokCodeRuntimeSandboxById({ id })
  if (!runtime) {
    return NextResponse.json({ error: 'Runtime not found' }, { status: 404 })
  }

  const event = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  if (!event || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid log event.' }, { status: 400 })
  }

  const logs = await appendBrokCodeRuntimeBrowserEvent({
    runtime,
    event
  })

  return NextResponse.json({
    logs,
    diagnostics: getBrokCodeRuntimeDiagnostics(runtime)
  })
}
