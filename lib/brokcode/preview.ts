type PreviewFile = {
  path: string
  content: string
  language?: string | null
  updatedAt?: Date | string | null
}

type PreviewProject = {
  id: string
  name: string
  slug?: string | null
  username?: string | null
  updatedAt?: Date | string | null
}

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp'
}

export type ManagedPreviewAsset = {
  content: string
  contentType: string
  isHtml: boolean
  path: string
  status: 200
}

function extensionForPath(path: string) {
  const lastDot = path.lastIndexOf('.')
  if (lastDot === -1) return ''
  return path.slice(lastDot).toLowerCase()
}

function normalizeStoredFilePath(value: string) {
  return value.trim().replace(/\\/g, '/').replace(/^\/+/, '')
}

function normalizeDeploymentHandlePart(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'app'
  )
}

export function normalizeManagedPreviewPath(pathParts?: string[] | null) {
  const raw = pathParts?.length ? pathParts.join('/') : 'index.html'
  const normalized = raw.trim().replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized) return null

  const segments = normalized.split('/')
  if (
    segments.some(
      segment =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.includes('\0')
    )
  ) {
    return null
  }

  return normalized
}

export function makeManagedPreviewUrl({
  origin,
  projectId
}: {
  origin: string
  projectId: string
}) {
  return `${origin.replace(/\/+$/, '')}/api/brokcode/previews/${encodeURIComponent(projectId)}/index.html`
}

export function makeManagedDeploymentUrl({
  origin,
  project
}: {
  origin: string
  project: PreviewProject
}) {
  const handle = normalizeDeploymentHandlePart(
    project.username || project.slug || project.name || 'app'
  )
  return `${origin.replace(/\/+$/, '')}/brokcode/apps/${encodeURIComponent(`${handle}--${project.id}`)}/index.html`
}

function normalizeOrigin(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return null

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`
    const url = new URL(withProtocol)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    if (url.hostname === '0.0.0.0') return null
    return url.origin
  } catch {
    return null
  }
}

function isLocalPreviewOrigin(origin: string | null) {
  if (!origin) return false

  try {
    const { hostname } = new URL(origin)
    return hostname === 'localhost' || hostname === '127.0.0.1'
  } catch {
    return false
  }
}

export function resolvePublicPreviewOrigin(request: {
  headers: Headers
  url: string
}) {
  const configured =
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizeOrigin(process.env.NEXT_PUBLIC_BASE_URL) ??
    normalizeOrigin(process.env.BASE_URL) ??
    normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL)
  const forwardedHost =
    request.headers.get('x-forwarded-host') ??
    request.headers.get('x-host') ??
    request.headers.get('host')
  const forwardedProto =
    request.headers.get('x-forwarded-proto') ??
    request.headers.get('x-protocol') ??
    'https'
  const forwardedOrigin =
    forwardedHost && normalizeOrigin(`${forwardedProto}://${forwardedHost}`)
  if (
    forwardedOrigin &&
    isLocalPreviewOrigin(configured) &&
    isLocalPreviewOrigin(forwardedOrigin)
  ) {
    return forwardedOrigin
  }

  if (configured) return configured

  if (forwardedOrigin) return forwardedOrigin

  const directOrigin = normalizeOrigin(new URL(request.url).origin)
  if (directOrigin) return directOrigin

  const railwayDomain = normalizeOrigin(process.env.RAILWAY_PUBLIC_DOMAIN)
  if (railwayDomain) return railwayDomain

  return 'http://localhost:3000'
}

function buildGeneratedIndexHtml({
  project,
  files
}: {
  project: PreviewProject
  files: PreviewFile[]
}) {
  const safeName = escapeHtml(project.name || project.slug || 'BrokCode app')
  const fileList = files
    .map(file => `<li><code>${escapeHtml(file.path)}</code></li>`)
    .join('')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeName}</title>
    <style>
      body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #fbfaf8; color: #18181b; }
      main { min-height: 100vh; display: grid; place-items: center; padding: 40px 20px; }
      section { width: min(680px, 100%); border: 1px solid #e4e4e7; border-radius: 18px; background: white; padding: 28px; box-shadow: 0 24px 80px -56px rgba(0, 0, 0, 0.8); }
      h1 { margin: 0 0 10px; font-size: 24px; letter-spacing: 0; }
      p { margin: 0 0 18px; color: #52525b; line-height: 1.6; }
      ul { margin: 0; padding-left: 18px; color: #3f3f46; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${safeName}</h1>
        <p>BrokCode Cloud preview is ready. Ask Brok to build the first screen, and it will render here automatically.</p>
        <ul>${fileList || '<li>No saved project files yet.</li>'}</ul>
      </section>
    </main>
  </body>
</html>`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function valueTimestamp(value: Date | string | null | undefined) {
  if (!value) return ''
  if (value instanceof Date) return value.toISOString()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}

export function getManagedPreviewVersion({
  files,
  project
}: {
  files: PreviewFile[]
  project: PreviewProject
}) {
  return [
    project.id,
    project.slug ?? '',
    project.username ?? '',
    valueTimestamp(project.updatedAt),
    ...files
      .map(file =>
        [
          normalizeStoredFilePath(file.path),
          file.content.length,
          valueTimestamp(file.updatedAt)
        ].join(':')
      )
      .sort()
  ].join('|')
}

function buildHotReloadScript({
  project,
  files
}: {
  project: PreviewProject
  files: PreviewFile[]
}) {
  const endpoint = `/api/brokcode/previews/${encodeURIComponent(project.id)}/__brokcode_hot.json`
  const version = getManagedPreviewVersion({ files, project })

  return `<script data-brokcode-hot-reload>
(() => {
  const currentVersion = ${JSON.stringify(version)};
  const endpoint = ${JSON.stringify(endpoint)};
  async function checkForUpdate() {
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      if (payload.version && payload.version !== currentVersion) {
        window.location.reload();
      }
    } catch {}
  }
  window.addEventListener('focus', checkForUpdate);
  window.setInterval(checkForUpdate, 1200);
})();
</script>`
}

function injectHotReloadScript({
  content,
  project,
  files
}: {
  content: string
  project: PreviewProject
  files: PreviewFile[]
}) {
  let html = injectBuiltWithBrokBadge(content)

  if (html.includes('data-brokcode-hot-reload')) return html

  const script = buildHotReloadScript({ project, files })
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${script}</body>`)
  }
  return `${html}${script}`
}

function buildBuiltWithBrokBadge() {
  return `<a href="/" target="_blank" rel="noopener noreferrer" data-brokcode-brand-badge style="position:fixed;right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483647;display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.22);border-radius:999px;background:rgba(9,9,11,.88);color:#fff;padding:8px 10px;font:600 12px/1 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-decoration:none;box-shadow:0 14px 40px rgba(0,0,0,.22);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);letter-spacing:0;">Built with Brok</a>`
}

function injectBuiltWithBrokBadge(content: string) {
  if (content.includes('data-brokcode-brand-badge')) return content

  const badge = buildBuiltWithBrokBadge()
  if (/<\/body>/i.test(content)) {
    return content.replace(/<\/body>/i, `${badge}</body>`)
  }

  return `${content}${badge}`
}

function buildHotReloadManifest({
  files,
  project
}: {
  files: PreviewFile[]
  project: PreviewProject
}) {
  return JSON.stringify({
    projectId: project.id,
    slug: project.slug,
    version: getManagedPreviewVersion({ files, project }),
    fileCount: files.length,
    updatedAt: valueTimestamp(project.updatedAt) || new Date().toISOString()
  })
}

export function getManagedPreviewAsset({
  files,
  pathParts,
  project
}: {
  files: PreviewFile[]
  pathParts?: string[] | null
  project: PreviewProject
}): ManagedPreviewAsset | null {
  const requestedPath = normalizeManagedPreviewPath(pathParts)
  if (!requestedPath) return null

  if (requestedPath === '__brokcode_hot.json') {
    return {
      content: buildHotReloadManifest({ files, project }),
      contentType: CONTENT_TYPES['.json'],
      isHtml: false,
      path: requestedPath,
      status: 200
    }
  }

  const normalizedFiles = new Map(
    files.map(file => [normalizeStoredFilePath(file.path), file])
  )

  const candidates = [requestedPath]
  if (!extensionForPath(requestedPath)) {
    candidates.push(`${requestedPath}/index.html`)
  }

  for (const candidate of candidates) {
    const file = normalizedFiles.get(candidate)
    if (!file) continue

    const extension = extensionForPath(candidate)
    return {
      content:
        extension === '.html'
          ? injectHotReloadScript({ content: file.content, project, files })
          : file.content,
      contentType: CONTENT_TYPES[extension] ?? 'text/plain; charset=utf-8',
      isHtml: extension === '.html',
      path: candidate,
      status: 200
    }
  }

  const indexFile = normalizedFiles.get('index.html')
  if (indexFile && !extensionForPath(requestedPath)) {
    return {
      content: injectHotReloadScript({
        content: indexFile.content,
        project,
        files
      }),
      contentType: CONTENT_TYPES['.html'],
      isHtml: true,
      path: 'index.html',
      status: 200
    }
  }

  return null
}

export function getManagedPreviewPlaceholderAsset({
  files,
  project
}: {
  files: PreviewFile[]
  project: PreviewProject
}): ManagedPreviewAsset {
  return {
    content: injectHotReloadScript({
      content: buildGeneratedIndexHtml({ project, files }),
      project,
      files
    }),
    contentType: CONTENT_TYPES['.html'],
    isHtml: true,
    path: 'index.html',
    status: 200
  }
}

export function hasRenderableManagedPreview(files: PreviewFile[]) {
  return files.some(file => normalizeStoredFilePath(file.path) === 'index.html')
}

export function managedPreviewSecurityHeaders(asset: {
  contentType: string
  isHtml?: boolean
}) {
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    'Content-Type': asset.contentType,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff'
  }

  if (asset.isHtml) {
    headers['Content-Security-Policy'] = [
      "default-src 'none'",
      "base-uri 'self'",
      "connect-src 'self'",
      "font-src 'self' data:",
      "form-action 'none'",
      "frame-ancestors 'self'",
      "img-src 'self' data: blob:",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'unsafe-inline' 'self'"
    ].join('; ')
  }

  return headers
}

export function getManagedPreviewAssetOrPlaceholder({
  files,
  pathParts,
  project
}: {
  files: PreviewFile[]
  pathParts?: string[] | null
  project: PreviewProject
}): ManagedPreviewAsset | null {
  const requestedPath = normalizeManagedPreviewPath(pathParts)
  if (!requestedPath) return null

  const asset = getManagedPreviewAsset({ files, pathParts, project })
  if (asset) return asset

  if (requestedPath === 'index.html') {
    return {
      ...getManagedPreviewPlaceholderAsset({ project, files }),
      path: 'index.html'
    }
  }

  return null
}
