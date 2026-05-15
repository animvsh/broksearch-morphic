import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { summarizeBrokMailIntegrationError } from '@/lib/brokmail/integration-errors'
import {
  canExecuteComposioTools,
  isComposioConfigured,
  isComposioConnectMode,
  listConnectedAccounts
} from '@/lib/integrations/composio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_GMAIL_TOOLKIT_CANDIDATES = ['gmail', 'googlesuper']

function resolveToolkitCandidates() {
  const configured = process.env.COMPOSIO_GMAIL_TOOLKIT_SLUGS?.trim()
  if (!configured) return DEFAULT_GMAIL_TOOLKIT_CANDIDATES

  const candidates = configured
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)

  return candidates.length > 0 ? candidates : DEFAULT_GMAIL_TOOLKIT_CANDIDATES
}

export async function GET() {
  if (!isComposioConfigured()) {
    return NextResponse.json({
      configured: false,
      connected: false,
      provider: 'unavailable',
      message:
        'Composio is not configured. BrokMail Gmail uses Composio only; platform Google OAuth is disabled.'
    })
  }

  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        {
          configured: true,
          connected: false,
          provider: isComposioConnectMode() ? 'composio-connect' : 'composio',
          message: 'Sign in to Brok before checking Gmail status.'
        },
        { status: 401 }
      )
    }

    const settledAccountsByToolkit = await Promise.allSettled(
      resolveToolkitCandidates().map(async toolkit => {
        const accounts = await listConnectedAccounts(user.id, toolkit, 20)
        return { toolkit, accounts }
      })
    )
    const accountsByToolkit = settledAccountsByToolkit
      .filter(
        (
          result
        ): result is PromiseFulfilledResult<{
          toolkit: string
          accounts: Awaited<ReturnType<typeof listConnectedAccounts>>
        }> => result.status === 'fulfilled'
      )
      .map(result => result.value)

    const connectedAccounts = accountsByToolkit.flatMap(result =>
      result.accounts.filter(account => {
        const status = account.status?.toLowerCase()
        return !status || ['active', 'connected', 'enabled'].includes(status)
      })
    )

    const executionReady = canExecuteComposioTools()
    const accountConnected = connectedAccounts.length > 0

    return NextResponse.json({
      configured: true,
      connected: accountConnected && executionReady,
      accountConnected,
      executionReady,
      provider: isComposioConnectMode() ? 'composio-connect' : 'composio',
      connectedCount: connectedAccounts.length,
      message:
        accountConnected && !executionReady
          ? 'Gmail is connected for OAuth, but BrokMail needs a backend COMPOSIO_API_KEY before it can sync or act on mail.'
          : undefined,
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
        provider: 'unavailable',
        message: summarizeBrokMailIntegrationError(
          error,
          'Could not check Composio Gmail connection.'
        )
      },
      { status: 200 }
    )
  }
}
