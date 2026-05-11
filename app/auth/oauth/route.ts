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

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const publicOrigin = resolvePublicOrigin(request, origin)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
  const next = resolveSafeNextPath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const isLocalEnv = process.env.NODE_ENV === 'development'
      if (isLocalEnv) {
        // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
        return NextResponse.redirect(`${origin}${next}`)
      }
      return NextResponse.redirect(`${publicOrigin}${next}`)
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${publicOrigin}/auth/error`)
}
