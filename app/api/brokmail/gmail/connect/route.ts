import { NextRequest, NextResponse } from 'next/server'

import { requireFeatureAccessForApi } from '@/lib/auth/app-access'
import { resolveBrokMailCallbackUrl } from '@/lib/brokmail/callback-url'
import { summarizeBrokMailIntegrationError } from '@/lib/brokmail/integration-errors'
import {
  createConnectedAccountLink,
  isComposioConfigured
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

export async function POST(request: NextRequest) {
  const redirectUrl = resolveBrokMailCallbackUrl(request, '?gmail=connected')

  const access = await requireFeatureAccessForApi('brokmail')
  if (!access.ok) return access.response
  const user = access.user

  if (!isComposioConfigured()) {
    return NextResponse.json(
      {
        provider: 'unavailable',
        connectionUrl: null,
        redirectUrl,
        message:
          'Composio is not configured. BrokMail Gmail requires a Composio Gmail auth config; platform Google OAuth is disabled.'
      },
      { status: 503 }
    )
  }

  try {
    const errors: string[] = []

    for (const toolkitSlug of resolveToolkitCandidates()) {
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
          `${toolkitSlug}: Composio did not return a Gmail connection URL.`
        )
      } catch (error) {
        errors.push(
          `${toolkitSlug}: ${summarizeBrokMailIntegrationError(error, 'Could not create a Gmail connection link.')}`
        )
      }
    }

    const message =
      errors.length > 0
        ? errors.join(' | ')
        : 'Composio did not return a Gmail connection URL.'

    return NextResponse.json(
      {
        provider: 'unavailable',
        connectionUrl: null,
        redirectUrl,
        message: `${message} Platform Google OAuth is disabled; configure Composio Gmail instead.`
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
          'Could not create Composio Gmail connection link.'
        )
      },
      { status: 502 }
    )
  }
}
