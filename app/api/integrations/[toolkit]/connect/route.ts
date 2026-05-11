import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
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

function normalizeToolkit(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
}

function readStringField(payload: unknown, field: string) {
  if (!payload || typeof payload !== 'object') return undefined
  const value = (payload as Record<string, unknown>)[field]
  return typeof value === 'string' ? value : undefined
}

function resolveSafeRedirectUrl(
  origin: string,
  value: unknown,
  fallback: string
) {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback
  }

  try {
    const parsed = new URL(value, origin)
    if (parsed.origin !== origin) {
      return fallback
    }
    return parsed.toString()
  } catch {
    return fallback
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ toolkit: string }> }
) {
  const params = await context.params
  const toolkit = normalizeToolkit(params.toolkit || '')
  const origin = resolveRequestOrigin(request)
  const body = await request.json().catch(() => null)
  const defaultRedirectUrl = `${origin}/integrations?integration=${encodeURIComponent(toolkit)}&connection=callback`
  const redirectUrl = resolveSafeRedirectUrl(
    origin,
    readStringField(body, 'redirectUrl') ||
      request.nextUrl.searchParams.get('redirectUrl'),
    defaultRedirectUrl
  )

  if (!toolkit) {
    return NextResponse.json(
      {
        provider: 'composio',
        ok: false,
        connectionUrl: null,
        redirectUrl,
        message: 'Missing toolkit slug.'
      },
      { status: 400 }
    )
  }

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      {
        provider: 'composio',
        ok: false,
        toolkit,
        connectionUrl: null,
        redirectUrl,
        message: 'Sign in to Brok before connecting integrations.'
      },
      { status: 401 }
    )
  }

  if (!isComposioConfigured()) {
    return NextResponse.json(
      {
        provider: 'composio',
        ok: false,
        toolkit,
        connectionUrl: null,
        redirectUrl,
        message:
          'Composio is not configured. Add COMPOSIO_API_KEY or COMPOSIO_CONNECT_KEY, then reload integrations.'
      },
      { status: 503 }
    )
  }

  try {
    const link = await createConnectedAccountLink({
      userId: user.id,
      toolkitSlug: toolkit,
      redirectUrl
    })

    if (!link.url) {
      return NextResponse.json(
        {
          provider: 'composio',
          ok: false,
          toolkit,
          connectionUrl: null,
          redirectUrl,
          raw: link.raw,
          message: `Composio did not return a connection URL for ${toolkit}. Check that the auth config is enabled and has a valid callback URL.`
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      provider: 'composio',
      ok: true,
      toolkit,
      connectionUrl: link.url,
      redirectUrl,
      callbackUrl: redirectUrl
    })
  } catch (error) {
    return NextResponse.json(
      {
        provider: 'composio',
        ok: false,
        toolkit,
        connectionUrl: null,
        redirectUrl,
        message:
          error instanceof Error
            ? error.message
            : `Could not create the ${toolkit} connection link.`
      },
      { status: 502 }
    )
  }
}
