import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import {
  isComposioConfigured,
  isComposioConnectMode,
  listAuthConfigs,
  listConnectedAccounts
} from '@/lib/integrations/composio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normalizeToolkit(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
}

function isActiveAccountStatus(status?: string) {
  return !status || ['active', 'connected', 'enabled'].includes(status)
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
        status: 'unavailable',
        toolkit,
        provider: 'composio',
        message: 'Missing toolkit slug.'
      },
      { status: 400 }
    )
  }

  if (!isComposioConfigured()) {
    return NextResponse.json(
      {
        configured: false,
        connected: false,
        status: 'unavailable',
        toolkit,
        provider: 'composio',
        message:
          'Composio is not configured. Add COMPOSIO_API_KEY or COMPOSIO_CONNECT_KEY, then reload integrations.'
      },
      { status: 503 }
    )
  }

  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        {
          configured: true,
          connected: false,
          status: 'unavailable',
          toolkit,
          provider: isComposioConnectMode() ? 'composio-connect' : 'composio',
          message: 'Sign in to Brok before checking integration status.'
        },
        { status: 401 }
      )
    }

    const [accounts, authConfigs] = await Promise.all([
      listConnectedAccounts(user.id, toolkit, 50),
      listAuthConfigs(toolkit)
    ])
    const connectedAccounts = accounts.filter(account => {
      const status = account.status?.toLowerCase()
      return isActiveAccountStatus(status)
    })
    const ready = authConfigs.length > 0
    const connected = connectedAccounts.length > 0

    return NextResponse.json({
      configured: true,
      connected,
      status: connected ? 'connected' : ready ? 'ready' : 'unavailable',
      toolkit,
      provider: isComposioConnectMode() ? 'composio-connect' : 'composio',
      authConfigCount: authConfigs.length,
      connectedCount: connectedAccounts.length,
      accounts: connectedAccounts.map(account => ({
        id: account.id,
        status: account.status,
        toolkit: account.toolkit_slug || account.toolkit || toolkit
      })),
      message: connected
        ? `${toolkit} is connected through Composio.`
        : ready
          ? `${toolkit} is ready to connect. Complete the provider approval popup to finish setup.`
          : `${toolkit} is not configured in Composio yet.`
    })
  } catch (error) {
    return NextResponse.json(
      {
        configured: true,
        connected: false,
        status: 'unavailable',
        toolkit,
        provider: isComposioConnectMode() ? 'composio-connect' : 'composio',
        message:
          error instanceof Error
            ? error.message
            : `Could not check ${toolkit} connection status.`
      },
      { status: 502 }
    )
  }
}
