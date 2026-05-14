import { NextRequest, NextResponse } from 'next/server'

export type JsonBodyResult<T = Record<string, unknown>> =
  | { ok: true; body: T }
  | { ok: false; response: NextResponse }

export async function readJsonBody<T = Record<string, unknown>>(
  request: NextRequest
): Promise<JsonBodyResult<T>> {
  try {
    const body = await request.json()

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return {
        ok: false,
        response: invalidRequestResponse(
          'invalid_json',
          'Request body must be a JSON object.'
        )
      }
    }

    return { ok: true, body: body as T }
  } catch {
    return {
      ok: false,
      response: invalidRequestResponse(
        'invalid_json',
        'Request body must be valid JSON.'
      )
    }
  }
}

export function invalidRequestResponse(code: string, message: string) {
  return NextResponse.json(
    {
      error: {
        type: 'invalid_request_error',
        code,
        message
      }
    },
    { status: 400 }
  )
}

export function brokRateLimitHeaders({
  limit,
  current,
  resetAt,
  includeRetryAfter = false
}: {
  limit: number
  current: number
  resetAt: number
  includeRetryAfter?: boolean
}) {
  const remaining = Math.max(0, limit - current)
  const retryAfter = Math.max(0, Math.ceil(resetAt - Date.now() / 1000))
  const headers: Record<string, string> = {
    'X-Brok-RateLimit-Limit': String(limit),
    'X-Brok-RateLimit-Remaining': String(remaining),
    'X-Brok-RateLimit-Reset': String(resetAt),
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(resetAt)
  }

  if (includeRetryAfter) {
    headers['Retry-After'] = String(retryAfter)
    headers['X-Brok-RateLimit-Retry-After'] = String(retryAfter)
    headers['X-RateLimit-Retry-After'] = String(retryAfter)
  }

  return headers
}
