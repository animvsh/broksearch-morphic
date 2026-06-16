import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { invalidRequestResponse, readJsonBody } from '@/lib/brok/http'
import { getOrCreatePlaygroundSessionKey } from '@/lib/brok/playground-session-key'

export const runtime = 'nodejs'

type PlaygroundMode = 'chat' | 'search'

const MODE_ENDPOINTS: Record<PlaygroundMode, string> = {
  chat: '/api/v1/chat/completions',
  search: '/api/v1/search/completions'
}

function isPlaygroundMode(value: unknown): value is PlaygroundMode {
  return value === 'chat' || value === 'search'
}

async function resolvePlaygroundApiKey() {
  const user = await getCurrentUser()
  if (!user) {
    return null
  }

  const session = await getOrCreatePlaygroundSessionKey(user.id)
  return session.rawKey
}

export async function POST(request: NextRequest) {
  const parsed = await readJsonBody<{
    mode?: unknown
    apiKey?: unknown
    payload?: unknown
  }>(request)

  if (!parsed.ok) return parsed.response

  const { mode, apiKey, payload } = parsed.body

  if (!isPlaygroundMode(mode)) {
    return invalidRequestResponse(
      'invalid_playground_mode',
      'mode must be either chat or search.'
    )
  }

  if (apiKey !== undefined && apiKey !== null && apiKey !== '') {
    return invalidRequestResponse(
      'browser_api_key_not_allowed',
      'The hosted playground uses an account-owned server-side session key. Do not send raw API keys from browser code.'
    )
  }

  const resolvedApiKey = await resolvePlaygroundApiKey()
  if (!resolvedApiKey) {
    return invalidRequestResponse(
      'playground_session_required',
      'Sign in to use the hosted playground session key.'
    )
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return invalidRequestResponse(
      'invalid_payload',
      'payload must be a JSON object.'
    )
  }

  const upstream = await fetch(new URL(MODE_ENDPOINTS[mode], request.url), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resolvedApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    cache: 'no-store'
  })

  const headers = new Headers()
  const contentType = upstream.headers.get('content-type')
  const requestId =
    upstream.headers.get('x-request-id') ??
    upstream.headers.get('x-brok-request-id')

  if (contentType) headers.set('content-type', contentType)
  if (requestId) headers.set('x-request-id', requestId)
  headers.set('cache-control', 'no-store')

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  })
}
