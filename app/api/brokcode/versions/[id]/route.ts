import { NextRequest } from 'next/server'

import { unauthorizedResponse } from '@/lib/brok/auth'
import {
  enforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'
import { updateBrokCodeVersion } from '@/lib/brokcode/version-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authResult } = await resolveBrokCodeRequestAuth(request, {
    allowBrowserSession: true
  })
  if (!authResult.success) {
    return unauthorizedResponse(authResult)
  }
  const accountMismatch = await enforceBrokCodeAccountOwnership(authResult)
  if (accountMismatch) return accountMismatch

  const { id } = await params
  const body = await request.json().catch(() => null)
  const version = await updateBrokCodeVersion({
    id,
    workspaceId: authResult.workspace.id,
    checkpointName:
      typeof body?.checkpoint_name === 'string' ? body.checkpoint_name : null
  })

  if (!version) {
    return Response.json({ error: 'Version not found' }, { status: 404 })
  }

  return Response.json(
    { version },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
