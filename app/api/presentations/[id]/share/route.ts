import { NextRequest, NextResponse } from 'next/server'

import { and, eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { presentations } from '@/lib/db/schema-brok'
import { withOptionalRLS } from '@/lib/db/with-rls'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHARE_ID_ALPHABET =
  '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

function badRequest(message: string) {
  return NextResponse.json(
    {
      error: { type: 'invalid_request_error', code: 'invalid_request', message }
    },
    { status: 400 }
  )
}

function notFound() {
  return NextResponse.json(
    {
      error: {
        type: 'not_found',
        code: 'presentation_not_found',
        message: 'Presentation not found.'
      }
    },
    { status: 404 }
  )
}

function serviceUnavailable(message: string) {
  return NextResponse.json(
    { error: { type: 'service_unavailable', code: 'unavailable', message } },
    { status: 503 }
  )
}

function generateShareId(): string {
  const bytes = randomBytes(10)
  let out = ''
  for (let i = 0; i < bytes.length; i += 1) {
    out += SHARE_ID_ALPHABET[bytes[i] % SHARE_ID_ALPHABET.length]
  }
  return out
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!UUID_PATTERN.test(id ?? '')) {
    return badRequest('Invalid presentation id.')
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json(
      { error: { type: 'auth', message: 'Authentication required' } },
      { status: 401 }
    )
  }

  let body: { isPublic?: boolean } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const desiredPublic = body.isPublic !== false

  try {
    const result = await withOptionalRLS(userId, async tx => {
      const [existing] = await tx
        .select({
          id: presentations.id,
          shareId: presentations.shareId,
          isPublic: presentations.isPublic
        })
        .from(presentations)
        .where(and(eq(presentations.id, id), eq(presentations.userId, userId)))
        .limit(1)
      if (!existing) return null

      const shareId =
        existing.shareId ?? (desiredPublic ? generateShareId() : null)

      const [row] = await tx
        .update(presentations)
        .set({
          isPublic: desiredPublic,
          shareId,
          updatedAt: new Date()
        })
        .where(eq(presentations.id, id))
        .returning({
          id: presentations.id,
          isPublic: presentations.isPublic,
          shareId: presentations.shareId
        })
      return row ?? null
    })

    if (!result) return notFound()

    const origin =
      request.nextUrl.origin ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000'
    return NextResponse.json({
      isPublic: result.isPublic,
      shareId: result.shareId,
      shareUrl: result.shareId ? `${origin}/p/${result.shareId}` : null
    })
  } catch (error) {
    return serviceUnavailable(
      error instanceof Error ? error.message : 'Failed to update share settings'
    )
  }
}
