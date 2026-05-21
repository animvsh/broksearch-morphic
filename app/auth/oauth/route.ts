import { NextResponse } from 'next/server'

// The client you created from the Server-Side Auth instructions
import { resolveSafeNextPath } from '@/lib/auth/redirect'
import { createClient } from '@/lib/supabase/server'

function resolvePublicOrigin(request: Request, fallbackOrigin: string) {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`
  }

  return fallbackOrigin
}

function buildRedirectUrl({
  baseOrigin,
  next
}: {
  baseOrigin: string
  next: string
}) {
  return new URL(next, baseOrigin)
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const publicOrigin = resolvePublicOrigin(request, origin)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
  const next = resolveSafeNextPath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const isLocalEnv = process.env.NODE_ENV === 'development'
      const redirectOrigin = isLocalEnv ? origin : publicOrigin
      const redirectUrl = buildRedirectUrl({
        baseOrigin: redirectOrigin,
        next
      })

      return NextResponse.redirect(redirectUrl)
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${publicOrigin}/auth/error`)
}
