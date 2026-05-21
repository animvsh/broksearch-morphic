import { type NextRequest, NextResponse } from 'next/server'

import { updateSession } from '@/lib/supabase/middleware'

const DOCS_HOSTS = new Set(['docs.brok.fyi'])
const DOCS_CLEAN_PATHS = new Set([
  '/',
  '/admin',
  '/api-keys',
  '/brokcode',
  '/brokcode-api',
  '/brokmail',
  '/chat-completions',
  '/errors',
  '/insforge',
  '/integrations',
  '/models',
  '/quickstart',
  '/rate-limits',
  '/search-completions',
  '/security',
  '/tools'
])
const PWA_PUBLIC_PATHS = new Set([
  '/manifest.webmanifest',
  '/sw.js',
  '/offline.html'
])

function rewriteDocsSubdomain(request: NextRequest, host: string) {
  const hostname = host.split(':')[0]?.toLowerCase()
  if (!DOCS_HOSTS.has(hostname)) return null

  const pathname = request.nextUrl.pathname
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/docs') ||
    PWA_PUBLIC_PATHS.has(pathname) ||
    pathname === '/favicon.ico'
  ) {
    return null
  }

  if (!DOCS_CLEAN_PATHS.has(pathname)) return null

  const url = request.nextUrl.clone()
  url.pathname = pathname === '/' ? '/docs' : `/docs${pathname}`
  return NextResponse.rewrite(url)
}

export async function proxy(request: NextRequest) {
  // Get the protocol from X-Forwarded-Proto header or request protocol
  const protocol =
    request.headers.get('x-forwarded-proto') || request.nextUrl.protocol

  // Get the host from X-Forwarded-Host header or request host
  const host =
    request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const docsRewrite = rewriteDocsSubdomain(request, host)

  // Construct the base URL - ensure protocol has :// format
  const baseUrl = `${protocol}${protocol.endsWith(':') ? '//' : '://'}${host}`

  // Create a response
  let response: NextResponse

  // Handle Supabase session if configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (supabaseUrl && supabaseAnonKey) {
    response = await updateSession(request)
  } else {
    // If Supabase is not configured, just pass the request through
    response = NextResponse.next({
      request
    })
  }

  if (docsRewrite) {
    response.cookies.getAll().forEach(cookie => {
      docsRewrite.cookies.set(cookie)
    })
    response = docsRewrite
  }

  // Add request information to response headers
  response.headers.set('x-url', request.url)
  response.headers.set('x-host', host)
  response.headers.set('x-protocol', protocol)
  response.headers.set('x-base-url', baseUrl)

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  ]
}
