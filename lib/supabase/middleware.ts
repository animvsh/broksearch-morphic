import { type NextRequest, NextResponse } from 'next/server'

import { createServerClient } from '@supabase/ssr'

import { isAnonymousAuthMode } from '@/lib/auth/get-current-user'

const PUBLIC_PATH_EXACT = new Set([
  '/',
  '/features',
  '/pricing',
  '/manifest.webmanifest',
  '/sw.js',
  '/offline.html'
])
const PUBLIC_PATH_PREFIXES = [
  '/features',
  '/brokcode/apps',
  '/brokcode/shared',
  '/search',
  '/share',
  '/docs'
]
const PUBLIC_PATH_STEMS = ['/auth', '/api']

function normalizePathname(pathname: string) {
  const trimmed = pathname.trim()
  return trimmed === '/' ? '/' : trimmed.replace(/\/+$/, '')
}

export function isPublicPath(pathname: string) {
  const normalized = normalizePathname(pathname)
  return (
    PUBLIC_PATH_EXACT.has(normalized) ||
    PUBLIC_PATH_EXACT.has(pathname) ||
    PUBLIC_PATH_PREFIXES.some(
      prefix =>
        pathname === prefix ||
        normalized === prefix ||
        normalized.startsWith(`${prefix}/`)
    ) ||
    PUBLIC_PATH_STEMS.some(stem => pathname.startsWith(stem))
  )
}

export async function updateSession(request: NextRequest) {
  if (isAnonymousAuthMode()) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({
    request
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(
          cookiesToSet: Array<{
            name: string
            value: string
            options?: Parameters<typeof supabaseResponse.cookies.set>[2]
          }>
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        }
      }
    }
  )

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: DO NOT REMOVE auth.getUser()

  const {
    data: { user }
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isPublicRoute = isPublicPath(pathname)

  // Redirect to login if the user is not authenticated and the path is not public
  if (!user && !isPublicRoute) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set(
      'redirectTo',
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    )
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}
