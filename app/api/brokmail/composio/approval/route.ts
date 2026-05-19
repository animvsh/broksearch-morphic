import { NextRequest, NextResponse } from 'next/server'

import { requireFeatureAccessForApi } from '@/lib/auth/app-access'
import {
  assertActionPayloadIsRunnable,
  isRecord,
  normalizeActionApprovalPayload,
  signBrokMailApproval
} from '@/lib/brokmail/action-approval'
import { canExecuteComposioTools } from '@/lib/integrations/composio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!canExecuteComposioTools()) {
    return NextResponse.json(
      {
        error:
          'Composio is not configured. BrokMail Google approvals require Composio execution readiness.'
      },
      { status: 503 }
    )
  }

  const access = await requireFeatureAccessForApi('brokmail')
  if (!access.ok) return access.response
  const user = access.user

  const body = await request.json().catch(() => null)
  if (!isRecord(body)) {
    return NextResponse.json(
      { error: 'Invalid request body.' },
      { status: 400 }
    )
  }

  const payload = normalizeActionApprovalPayload(body)
  if (!payload) {
    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 })
  }

  try {
    assertActionPayloadIsRunnable(payload)
    return NextResponse.json({
      ok: true,
      approval: signBrokMailApproval({
        userId: user.id,
        payload
      })
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'BrokMail approval payload is invalid.'
      },
      { status: 400 }
    )
  }
}
