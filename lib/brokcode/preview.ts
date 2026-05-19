type PreviewFile = {
  path: string
  content: string
  language?: string | null
}

type PreviewProject = {
  id: string
  name: string
  slug?: string | null
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
      content: file.content,
      contentType: CONTENT_TYPES[extension] ?? 'text/plain; charset=utf-8',
      path: candidate,
      status: 200
    }
  }

  const indexFile = normalizedFiles.get('index.html')
  if (indexFile && !extensionForPath(requestedPath)) {
    return {
      content: indexFile.content,
      contentType: CONTENT_TYPES['.html'],
      path: 'index.html',
      status: 200
    }
  }

  if (requestedPath === 'index.html') {
    return {
      content: buildGeneratedIndexHtml({ project, files }),
      contentType: CONTENT_TYPES['.html'],
      path: 'index.html',
      status: 200
    }
  }

  return null
}
