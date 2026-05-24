import { NextRequest, NextResponse } from 'next/server'

import { requireFeatureAccessForApi } from '@/lib/auth/app-access'
import {
  consumeConnectorApproval,
  getConnectorActionRun,
  markConnectorActionRunFailed,
  markConnectorActionRunRunning,
  markConnectorActionRunSucceeded
} from '@/lib/connectors/action-runs'
import {
  canExecuteComposioTools,
  executeComposioTool,
  listConnectedAccounts
} from '@/lib/integrations/composio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

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

  const run = await getConnectorActionRun({ runId, userId: access.user.id })
  if (!run) {
    return NextResponse.json(
      { error: 'Connector action run was not found.' },
      { status: 404 }
    )
  }

  if (run.requiresApproval && run.status !== 'approved') {
    return NextResponse.json(
      { error: 'Approve this connector action before execution.' },
      { status: 409 }
    )
  }

  if (!run.toolSlug) {
    return NextResponse.json(
      { error: 'Connector action run is missing a Composio tool slug.' },
      { status: 400 }
    )
  }

  if (!canExecuteComposioTools()) {
    return NextResponse.json(
      {
        error:
          'Composio backend execution is not configured. COMPOSIO_CONNECT_KEY can connect accounts through MCP, but COMPOSIO_API_KEY is required to execute tools.'
      },
      { status: 503 }
    )
  }

  const payload = isRecord(run.payload) ? run.payload : {}
  const text = typeof payload.text === 'string' ? payload.text : undefined
  const toolArguments = isRecord(payload.arguments)
    ? payload.arguments
    : undefined
  let connectedAccountId =
    typeof payload.connectedAccountId === 'string'
      ? payload.connectedAccountId
      : undefined

  if (!text && !toolArguments) {
    return NextResponse.json(
      { error: 'Connector action run needs text or structured arguments.' },
      { status: 400 }
    )
  }

  try {
    await markConnectorActionRunRunning({ runId, userId: access.user.id })

    if (!connectedAccountId) {
      const accounts = await listConnectedAccounts(
        access.user.id,
        run.toolkit,
        10
      )
      connectedAccountId = accounts.find(account => {
        const status = account.status?.toLowerCase()
        return !status || ['active', 'connected', 'enabled'].includes(status)
      })?.id
    }

    const result = await executeComposioTool({
      toolSlug: run.toolSlug,
      userId: access.user.id,
      connectedAccountId,
      text,
      arguments: toolArguments
    })
    const normalizedResult = isRecord(result) ? result : { result }
    const succeeded = await markConnectorActionRunSucceeded({
      runId,
      userId: access.user.id,
      result: normalizedResult
    })

    if (run.approvalId) {
      await consumeConnectorApproval({
        approvalId: run.approvalId,
        userId: access.user.id
      })
    }

    return NextResponse.json({
      ok: true,
      run: {
        id: succeeded?.id || run.id,
        toolkit: run.toolkit,
        action: run.action,
        status: succeeded?.status || 'succeeded'
      },
      result
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Connector action execution failed.'
    await markConnectorActionRunFailed({
      runId,
      userId: access.user.id,
      error: message
    }).catch(() => undefined)

    return NextResponse.json({ error: message }, { status: 502 })
  }
}
