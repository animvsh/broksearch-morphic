import { NextRequest, NextResponse } from 'next/server'

import { getRequiredBrokAccountUser } from '@/lib/brokcode/account-guard'
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
  const body = await request.json().catch(() => ({}))
  const prompt = typeof body.prompt === 'string' ? body.prompt : ''
  const user = await getRequiredBrokAccountUser()
  const redirectUrl = new URL('/brokcode', origin)
  redirectUrl.searchParams.set('connect', 'github')
  redirectUrl.searchParams.set('github', 'connected')
  if (prompt.trim()) {
    redirectUrl.searchParams.set('prompt', prompt.trim())
    redirectUrl.searchParams.set('autostart', '1')
  }

  if (!user) {
    return NextResponse.json(
      {
        provider: 'composio',
        connectionUrl: null,
        redirectUrl: redirectUrl.toString(),
        message: 'Sign in to Brok before connecting GitHub.'
      },
      { status: 401 }
    )
  }

  if (!isComposioConfigured()) {
    return NextResponse.json(
      {
        provider: 'composio',
        connectionUrl: null,
        redirectUrl: redirectUrl.toString(),
        message: 'Composio is not configured for GitHub connections.'
      },
      { status: 200 }
    )
  }

  try {
    const link = await createConnectedAccountLink({
      userId: user.id,
      toolkitSlug: 'github',
      redirectUrl: redirectUrl.toString()
    })

    if (!link.url) {
      return NextResponse.json({
        provider: 'composio',
        connectionUrl: null,
        redirectUrl: redirectUrl.toString(),
        raw: link.raw,
        message: 'Composio did not return a GitHub connection URL.'
      })
    }

    return NextResponse.json({
      provider: 'composio',
      connectionUrl: link.url,
      redirectUrl: redirectUrl.toString()
    })
  } catch (error) {
    return NextResponse.json(
      {
        provider: 'composio',
        connectionUrl: null,
        redirectUrl: redirectUrl.toString(),
        message:
          error instanceof Error
            ? error.message
            : 'Could not create the GitHub connection link.'
      },
      { status: 200 }
    )
  }
}
