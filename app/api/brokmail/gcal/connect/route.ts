import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { resolveBrokMailCallbackUrl } from '@/lib/brokmail/callback-url'
import { summarizeBrokMailIntegrationError } from '@/lib/brokmail/integration-errors'
import {
  createConnectedAccountLink,
  isComposioConfigured
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

export async function POST(request: NextRequest) {
  const redirectUrl = resolveBrokMailCallbackUrl(request, '?gcal=connected')

  if (!isComposioConfigured()) {
    return NextResponse.json(
      {
        provider: 'unavailable',
        connectionUrl: null,
        redirectUrl,
        message:
          'Composio is not configured. BrokMail Calendar requires a Composio Calendar auth config; platform Google OAuth is disabled.'
      },
      { status: 503 }
    )
  }

  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        {
          provider: 'composio',
          connectionUrl: null,
          redirectUrl,
          message: 'Sign in to Brok before connecting Calendar.'
        },
        { status: 401 }
      )
    }

    const candidates = resolveToolkitCandidates()
    const errors: string[] = []

    for (const toolkitSlug of candidates) {
      try {
        const link = await createConnectedAccountLink({
          userId: user.id,
          toolkitSlug,
          redirectUrl
        })

        if (link.url) {
          return NextResponse.json({
            provider: 'composio',
            toolkit: toolkitSlug,
            connectionUrl: link.url,
            redirectUrl
          })
        }

        errors.push(
          `${toolkitSlug}: Composio did not return a Google Calendar connection URL.`
        )
      } catch (error) {
        errors.push(
          `${toolkitSlug}: ${summarizeBrokMailIntegrationError(error, 'Could not create a Calendar connection link.')}`
        )
      }
    }

    const message =
      errors.length > 0
        ? errors.join(' | ')
        : 'Could not create a Composio Google Calendar connection link.'

    return NextResponse.json(
      {
        provider: 'unavailable',
        connectionUrl: null,
        redirectUrl,
        message: `${message} Platform Google OAuth is disabled; configure Composio Calendar instead.`
      },
      { status: 502 }
    )
  } catch (error) {
    return NextResponse.json(
      {
        provider: 'unavailable',
        connectionUrl: null,
        redirectUrl,
        message: summarizeBrokMailIntegrationError(
          error,
          'Could not create Composio Calendar connection link.'
        )
      },
      { status: 502 }
    )
  }
}
