import { NextRequest, NextResponse } from 'next/server'

import { unauthorizedResponse } from '@/lib/brok/auth'
import {
  enforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'
import { resolvePublicPreviewOrigin } from '@/lib/brokcode/preview'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function resolveAllowedOrigins() {
  const derivedPreviewUrls = [
    process.env.BROKCODE_PREVIEW_URL,
    process.env.BROKCODE_DEPLOY_PREVIEW_URL,
    process.env.NEXT_PUBLIC_BROKCODE_PREVIEW_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.BASE_URL,
    process.env.RAILWAY_PUBLIC_DOMAIN,
    process.env.RAILWAY_STATIC_URL,
    process.env.NEXT_PUBLIC_SITE_URL
  ]

  return new Set(
    [
      ...(process.env.BROKCODE_PREVIEW_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map(value => value.trim()),
      ...derivedPreviewUrls
    ].flatMap(value => originVariants(value))
  )
}

function normalizeOrigin(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return null

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`
    return new URL(withProtocol).origin
  } catch {
    return null
  }
}

function originVariants(value: unknown) {
  const origin = normalizeOrigin(value)
  if (!origin) return []

  const variants = new Set([origin])
  try {
    const url = new URL(origin)
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4)
      variants.add(url.origin)
    } else if (!isLocalPreviewHost(url.hostname)) {
      url.hostname = `www.${url.hostname}`
      variants.add(url.origin)
    }
  } catch {
    return [origin]
  }

  return [...variants]
}

function isLocalPreviewHost(hostname: string) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1'
  )
}

function canCheckLocalPreviewHost() {
  if (process.env.BROKCODE_ALLOW_PRIVATE_PREVIEW === 'true') return true
  return process.env.NODE_ENV !== 'production'
}

function isAllowedPreviewUrl(url: URL, requestOrigin: string) {
  if (!['http:', 'https:'].includes(url.protocol)) return false
  if (url.pathname.startsWith('/brokcode')) return false
  if (isLocalPreviewHost(url.hostname)) return canCheckLocalPreviewHost()
  if (url.origin === requestOrigin) return true
  return resolveAllowedOrigins().has(url.origin)
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

function htmlHasVisibleContent(value: string) {
  const body = value.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? value
  const withoutHiddenBlocks = body
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
  const text = withoutHiddenBlocks.replace(/<[^>]+>/g, '').trim()
  return text.length > 0
}

export async function GET(request: NextRequest) {
  const publicOrigin = resolvePublicPreviewOrigin(request)
  const { authResult } = await resolveBrokCodeRequestAuth(request, {
    allowBrowserSession: true
  })
  if (!authResult.success) {
    return unauthorizedResponse(authResult)
  }
  const accountMismatch = await enforceBrokCodeAccountOwnership(authResult)
  if (accountMismatch) return accountMismatch

  const rawUrl = request.nextUrl.searchParams.get('url')
  if (!rawUrl) {
    return jsonNoStore(
      {
        ok: false,
        message: 'Preview URL is required.'
      },
      { status: 400 }
    )
  }

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return jsonNoStore(
      {
        ok: false,
        message: 'Preview URL must be a valid http(s) URL.'
      },
      { status: 400 }
    )
  }

  if (
    url.origin === publicOrigin &&
    (url.pathname.startsWith('/api/brokcode/previews/') ||
      url.pathname.startsWith('/api/brokcode/runtime/'))
  ) {
    return jsonNoStore({
      ok: true,
      reason: 'ready',
      status: 200,
      url: url.toString(),
      checkedAt: new Date().toISOString(),
      message: 'Managed BrokCode preview is ready.'
    })
  }

  if (!isAllowedPreviewUrl(url, publicOrigin)) {
    return jsonNoStore(
      {
        ok: false,
        message:
          'Preview checks are limited to localhost or configured BrokCode preview origins.'
      },
      { status: 400 }
    )
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2500)

  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal
    })

    const contentType = response.headers.get('content-type') ?? ''
    const body =
      response.ok && contentType.toLowerCase().includes('text/html')
        ? await response.text()
        : ''
    const blankHtml = response.ok && body ? !htmlHasVisibleContent(body) : false
    const reason = response.ok
      ? blankHtml
        ? 'blank'
        : 'ready'
      : response.status === 404
        ? 'not_found'
        : 'http_error'

    return jsonNoStore({
      ok: response.ok && !blankHtml,
      reason,
      status: response.status,
      url: url.toString(),
      checkedAt: new Date().toISOString(),
      message: response.ok
        ? blankHtml
          ? 'Preview loaded but appears blank.'
          : 'Preview server is reachable.'
        : response.status === 404
          ? 'Preview route returned 404.'
          : `Preview server responded with ${response.status}.`
    })
  } catch (error) {
    return jsonNoStore({
      ok: false,
      reason:
        error instanceof Error && error.name === 'AbortError'
          ? 'timeout'
          : 'unreachable',
      url: url.toString(),
      checkedAt: new Date().toISOString(),
      message:
        error instanceof Error && error.name === 'AbortError'
          ? 'Preview server timed out.'
          : 'Preview server is not reachable yet.'
    })
  } finally {
    clearTimeout(timeout)
  }
}
