import { NextRequest, NextResponse } from 'next/server'

import { requireFeatureAccessForApi } from '@/lib/auth/app-access'
import { approveConnectorActionRun } from '@/lib/connectors/action-runs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ runId: string }> }
) {
  const access = await requireFeatureAccessForApi('tools')
  if (!access.ok) return access.response

  const params = await context.params
  const runId = params.runId
  if (!runId) {
    return NextResponse.json(
      { error: 'Missing action run id.' },
      { status: 400 }
    )
  }

  try {
    const run = await approveConnectorActionRun({
      runId,
      userId: access.user.id
    })

    return NextResponse.json({
      ok: true,
      run: {
        id: run.id,
        toolkit: run.toolkit,
        action: run.action,
        status: run.status,
        requiresApproval: run.requiresApproval
      }
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not approve connector action.'
      },
      { status: 400 }
    )
  }
}
