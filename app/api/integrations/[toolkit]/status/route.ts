import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import {
  isComposioConfigured,
  isComposioConnectMode,
  listConnectedAccounts
} from '@/lib/integrations/composio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normalizeToolkit(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ toolkit: string }> }
) {
  const params = await context.params
  const toolkit = normalizeToolkit(params.toolkit || '')

  if (!toolkit) {
    return NextResponse.json(
      {
        configured: false,
        connected: false,
        toolkit,
        provider: 'composio',
        message: 'Missing toolkit slug.'
      },
      { status: 400 }
    )
  }

  if (!isComposioConfigured()) {
    return NextResponse.json({
      configured: false,
      connected: false,
      toolkit,
      provider: 'composio',
      message: 'Composio is not configured for integrations.'
    })
  }

  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        {
          configured: true,
          connected: false,
          toolkit,
          provider: isComposioConnectMode() ? 'composio-connect' : 'composio',
          message: 'Sign in to Brok before checking integration status.'
        },
        { status: 401 }
      )
    }

    const accounts = await listConnectedAccounts(user.id, toolkit, 50)
    const connectedAccounts = accounts.filter(account => {
      const status = account.status?.toLowerCase()
      return !status || ['active', 'connected', 'enabled'].includes(status)
    })

    return NextResponse.json({
      configured: true,
      connected: connectedAccounts.length > 0,
      toolkit,
      provider: isComposioConnectMode() ? 'composio-connect' : 'composio',
      connectedCount: connectedAccounts.length,
      accounts: connectedAccounts.map(account => ({
        id: account.id,
        status: account.status,
        toolkit: account.toolkit_slug || account.toolkit || toolkit
      }))
    })
  } catch (error) {
    return NextResponse.json({
      configured: true,
      connected: false,
      toolkit,
      provider: isComposioConnectMode() ? 'composio-connect' : 'composio',
      message:
        error instanceof Error
          ? error.message
          : `Could not check ${toolkit} connection status.`
    })
  }
}
