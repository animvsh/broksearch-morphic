import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import {
  createConnectedAccountLink,
  isComposioConfigured
} from '@/lib/integrations/composio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
  const redirectUrl = `${origin}/brokmail?gmail=connected`

  if (!isComposioConfigured()) {
    return NextResponse.json({
      provider: 'google-oauth',
      connectionUrl: null,
      redirectUrl,
      message:
        'Composio is not configured. Use Google Gmail OAuth fallback on the client.'
    })
  }

  try {
    const userId = (await getCurrentUserId()) || 'brokmail-user'
    const link = await createConnectedAccountLink({
      userId,
      toolkitSlug: 'gmail',
      redirectUrl
    })

    if (!link.url) {
      return NextResponse.json({
        provider: 'google-oauth',
        connectionUrl: null,
        redirectUrl,
        raw: link.raw,
        message:
          'Composio did not return a Gmail connection URL. Use Google Gmail OAuth fallback.'
      })
    }

    return NextResponse.json({
      provider: 'composio',
      connectionUrl: link.url,
      redirectUrl
    })
  } catch (error) {
    return NextResponse.json({
      provider: 'google-oauth',
      connectionUrl: null,
      redirectUrl,
      message:
        error instanceof Error
          ? error.message
          : 'Could not create Composio Gmail connection link.'
    })
  }
}
