import { NextResponse } from 'next/server'

import { getBrokCodeRuntimeProcess } from '@/lib/brokcode/runtime/process-manager'
import { getBrokCodeRuntimeSandboxById } from '@/lib/brokcode/runtime/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function createConsoleBridge(runtimeId: string) {
  const endpoint = `/api/brokcode/runtime/${encodeURIComponent(runtimeId)}/logs`
  return `<script>
(() => {
  const endpoint = ${JSON.stringify(endpoint)};
  const send = event => {
    try {
      const body = JSON.stringify(event);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
        return;
      }
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true
      }).catch(() => {});
    } catch {}
  };
  const normalize = value => {
    if (value instanceof Error) return value.stack || value.message;
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };
  const originalError = console.error;
  console.error = (...args) => {
    send({
      level: 'error',
      message: args.map(normalize).join(' '),
      stack: args.find(arg => arg instanceof Error)?.stack
    });
    originalError.apply(console, args);
  };
  window.addEventListener('error', event => {
    send({
      level: 'error',
      message: event.message,
      stack: event.error?.stack,
      file: event.filename,
      line: event.lineno,
      column: event.colno
    });
  });
  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason;
    send({
      level: 'error',
      message: normalize(reason),
      stack: reason?.stack
    });
  });
})();
</script>`
}

function injectConsoleBridge(html: string, runtimeId: string) {
  const script = createConsoleBridge(runtimeId)
  if (html.includes('</body>')) {
    return html.replace('</body>', `${script}</body>`)
  }
  return `${html}${script}`
}

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
  headers.delete('content-length')

  const contentType = headers.get('content-type') ?? ''
  if (contentType.includes('text/html')) {
    return new NextResponse(
      injectConsoleBridge(await response.text(), runtime.id),
      {
        status: response.status,
        headers
      }
    )
  }

  return new NextResponse(response.body, {
    status: response.status,
    headers
  })
}
