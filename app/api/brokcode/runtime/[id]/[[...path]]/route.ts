import { NextResponse } from 'next/server'

import { getBrokCodeRuntimeProcess } from '@/lib/brokcode/runtime/process-manager'
import { getBrokCodeRuntimeSandboxById } from '@/lib/brokcode/runtime/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; path?: string[] }> }
) {
  const { id, path } = await params
  const runtime = await getBrokCodeRuntimeSandboxById({ id })
  if (!runtime) {
    return NextResponse.json({ error: 'Runtime not found' }, { status: 404 })
  }

  const processEntry = getBrokCodeRuntimeProcess(runtime.id)
  if (!processEntry || processEntry.status !== 'ready') {
    return NextResponse.json(
      { error: 'Runtime preview is not ready yet.' },
      { status: 503 }
    )
  }

  const requestUrl = new URL(request.url)
  const targetPath = path?.length ? `/${path.join('/')}` : '/'
  const targetUrl = new URL(targetPath, processEntry.url)
  targetUrl.search = requestUrl.search
  const response = await fetch(targetUrl, {
    method: 'GET',
    headers: {
      accept: request.headers.get('accept') ?? '*/*'
    },
    redirect: 'manual'
  })
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-store')
  headers.delete('content-security-policy')
  headers.delete('x-frame-options')

  return new NextResponse(response.body, {
    status: response.status,
    headers
  })
}
