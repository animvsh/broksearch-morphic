import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { summarizeBrokMailIntegrationError } from '@/lib/brokmail/integration-errors'
import {
  isComposioConfigured,
  isComposioConnectMode,
  listConnectedAccounts
} from '@/lib/integrations/composio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_GCAL_TOOLKIT_CANDIDATES = [
  'googlecalendar',
  'googlesuper',
  'google-calendar',
  'google_calendar',
  'gcal',
  'calendar'
]

function resolveToolkitCandidates() {
  const configured = process.env.COMPOSIO_GCAL_TOOLKIT_SLUGS?.trim()
  if (!configured) return DEFAULT_GCAL_TOOLKIT_CANDIDATES

  const candidates = configured
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)

  return candidates.length > 0 ? candidates : DEFAULT_GCAL_TOOLKIT_CANDIDATES
}

export async function GET() {
  if (!isComposioConfigured()) {
    return NextResponse.json({
      configured: false,
      connected: false,
      provider: 'unavailable',
      message:
        'Composio is not configured. BrokMail Calendar uses Composio only; platform Google OAuth is disabled.'
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
          message: 'Sign in to Brok before checking Calendar status.'
        },
        { status: 401 }
      )
    }

    const candidates = resolveToolkitCandidates()
    const accountsByToolkit = await Promise.all(
      candidates.map(async toolkit => {
        const accounts = await listConnectedAccounts(user.id, toolkit, 20)
        return { toolkit, accounts }
      })
    )

    const connectedAccounts = accountsByToolkit.flatMap(result =>
      result.accounts.filter(account => {
        const status = account.status?.toLowerCase()
        return !status || ['active', 'connected', 'enabled'].includes(status)
      })
    )

    return NextResponse.json({
      configured: true,
      connected: connectedAccounts.length > 0,
      provider: isComposioConnectMode() ? 'composio-connect' : 'composio',
      connectedCount: connectedAccounts.length,
      accounts: connectedAccounts.map(account => ({
        id: account.id,
        status: account.status,
        toolkit: account.toolkit_slug || account.toolkit || 'googlecalendar'
      }))
    })
  } catch (error) {
    return NextResponse.json(
      {
        configured: true,
        connected: false,
        provider: isComposioConnectMode() ? 'composio-connect' : 'composio',
        message: summarizeBrokMailIntegrationError(
          error,
          'Could not check Google Calendar connection.'
        )
      },
      { status: 200 }
    )
  }
}
