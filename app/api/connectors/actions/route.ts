import { NextRequest, NextResponse } from 'next/server'

import { requireFeatureAccessForApi } from '@/lib/auth/app-access'
import {
  ConnectorActionRunInput,
  createConnectorActionRun
} from '@/lib/connectors/action-runs'
import { getConnectorToolkitDefinition } from '@/lib/integrations/toolkit-registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CONNECTOR_ACTIONS = [
  'connect',
  'create',
  'read',
  'update',
  'delete',
  'send',
  'schedule'
] as const

function isConnectorAction(
  value: unknown
): value is ConnectorActionRunInput['action'] {
  return CONNECTOR_ACTIONS.includes(value as ConnectorActionRunInput['action'])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

export async function POST(request: NextRequest) {
  const access = await requireFeatureAccessForApi('tools')
  if (!access.ok) return access.response

  const body = await request.json().catch(() => null)
  if (!isRecord(body)) {
    return NextResponse.json(
      { error: 'Invalid request body.' },
      { status: 400 }
    )
  }

  const toolkit = typeof body.toolkit === 'string' ? body.toolkit : ''
  const definition = getConnectorToolkitDefinition(toolkit)
  if (!definition) {
    return NextResponse.json(
      { error: 'Unsupported connector toolkit.' },
      { status: 400 }
    )
  }

  if (!isConnectorAction(body.action)) {
    return NextResponse.json(
      { error: 'Unsupported connector action.' },
      { status: 400 }
    )
  }

  if (
    body.arguments !== undefined &&
    (!body.arguments ||
      typeof body.arguments !== 'object' ||
      Array.isArray(body.arguments))
  ) {
    return NextResponse.json(
      { error: 'Connector action arguments must be an object.' },
      { status: 400 }
    )
  }

  const { run, approval } = await createConnectorActionRun({
    userId: access.user.id,
    chatId: typeof body.chatId === 'string' ? body.chatId : undefined,
    toolkit,
    action: body.action,
    toolSlug: typeof body.toolSlug === 'string' ? body.toolSlug : undefined,
    text: typeof body.text === 'string' ? body.text : undefined,
    arguments: isRecord(body.arguments) ? body.arguments : undefined,
    connectedAccountId:
      typeof body.connectedAccountId === 'string'
        ? body.connectedAccountId
        : undefined
  })

  return NextResponse.json({
    ok: true,
    run: {
      id: run.id,
      toolkit: run.toolkit,
      action: run.action,
      status: run.status,
      requiresApproval: run.requiresApproval,
      approvalId: run.approvalId
    },
    approval
  })
}
