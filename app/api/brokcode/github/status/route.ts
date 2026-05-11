import { NextResponse } from 'next/server'

import { getRequiredBrokAccountUser } from '@/lib/brokcode/account-guard'
import {
  isComposioConfigured,
  isComposioConnectMode,
  listConnectedAccounts
} from '@/lib/integrations/composio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getRequiredBrokAccountUser()
  if (!user) {
    return NextResponse.json(
      {
        configured: true,
        connected: false,
        provider: 'composio',
        message: 'Sign in to Brok before connecting GitHub.'
      },
      { status: 401 }
    )
  }

  if (!isComposioConfigured()) {
    return NextResponse.json({
      configured: false,
      connected: false,
      provider: 'composio',
      message: 'Composio is not configured for GitHub connections.'
    })
  }

  try {
    const accounts = await listConnectedAccounts(user.id, 'github', 20)
    const connectedAccounts = accounts.filter(account => {
      const status = account.status?.toLowerCase()
      return !status || ['active', 'connected', 'enabled'].includes(status)
    })

    return NextResponse.json({
      configured: true,
      connected: connectedAccounts.length > 0,
      provider: isComposioConnectMode() ? 'composio-connect' : 'composio',
      connectedCount: connectedAccounts.length,
      accounts: connectedAccounts.map(account => ({
        id: account.id,
        status: account.status,
        toolkit: account.toolkit_slug || account.toolkit || 'github'
      }))
    })
  } catch (error) {
    return NextResponse.json(
      {
        configured: true,
        connected: false,
        provider: isComposioConnectMode() ? 'composio-connect' : 'composio',
        message:
          error instanceof Error
            ? error.message
            : 'Could not check GitHub connection.'
      },
      { status: 200 }
    )
  }
}
