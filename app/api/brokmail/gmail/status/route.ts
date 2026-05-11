import { NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import {
  isComposioConfigured,
  isComposioConnectMode,
  listConnectedAccounts
} from '@/lib/integrations/composio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!isComposioConfigured()) {
    return NextResponse.json({
      configured: false,
      connected: false,
      provider: 'google-oauth',
      message:
        'Composio is not configured. BrokMail can still use Google Gmail OAuth.'
    })
  }

  try {
    const userId = (await getCurrentUserId()) || 'brokmail-user'
    const accounts = await listConnectedAccounts(userId, 'gmail', 20)
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
        toolkit: account.toolkit_slug || account.toolkit || 'gmail'
      }))
    })
  } catch (error) {
    return NextResponse.json(
      {
        configured: true,
        connected: false,
        provider: 'google-oauth',
        message:
          error instanceof Error
            ? error.message
            : 'Could not check Composio Gmail connection.'
      },
      { status: 200 }
    )
  }
}
