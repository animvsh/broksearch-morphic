import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import {
  createConnectedAccountLink,
  isComposioConfigured
} from '@/lib/integrations/composio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_GCAL_TOOLKIT_CANDIDATES = [
  'googlesuper',
  'googlecalendar',
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

function resolveRequestOrigin(request: NextRequest) {
  const host =
    request.headers.get('x-forwarded-host') || request.headers.get('host')
  const protocol =
    request.headers.get('x-forwarded-proto') ||
    request.nextUrl.protocol.replace(':', '')

  if (host) {
    return `${protocol}://${host}`
  }

  return request.nextUrl.origin
}

export async function POST(request: NextRequest) {
  const origin = resolveRequestOrigin(request)
  const redirectUrl = `${origin}/brokmail?gcal=connected`

  if (!isComposioConfigured()) {
    return NextResponse.json({
      provider: 'google-oauth',
      connectionUrl: null,
      redirectUrl,
      message:
        'Composio is not configured. Use browser Calendar live sync in BrokMail.'
    })
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
          `${toolkitSlug}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`
        )
      }
    }

    return NextResponse.json({
      provider: 'google-oauth',
      connectionUrl: null,
      redirectUrl,
      message:
        errors.length > 0
          ? errors.join(' | ')
          : 'Could not create a Composio Google Calendar connection link.'
    })
  } catch (error) {
    return NextResponse.json({
      provider: 'google-oauth',
      connectionUrl: null,
      redirectUrl,
      message:
        error instanceof Error
          ? error.message
          : 'Could not create Composio Calendar connection link.'
    })
  }
}
