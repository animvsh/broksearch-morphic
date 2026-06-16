export type GeneratedBrokCodeFile = {
  path: string
  content: string
  language: string | null
}

export type GeneratedBrokCodeQualityReport = {
  hasHtmlEntry: boolean
  hasViewport: boolean
  hasTitle: boolean
  hasStyling: boolean
  hasInteraction: boolean
  hasEnoughVisibleCopy: boolean
  hasPlaceholderCopy: boolean
  issues: string[]
}

export type GeneratedBrokCodeFileOperation = {
  type: string
  path?: string
  fromPath?: string
  toPath?: string
  content?: string
  search?: string
  replace?: string
  patch?: string
  expectedChecksum?: string | null
  summary?: string | null
}

function filePathFromFenceInfo(info: string, language: string | null) {
  const filenameMatch = info.match(
    /(?:^|\s)(?:file|filename|path)=["']?([^"'\s]+)["']?/i
  )
  if (filenameMatch?.[1]) return filenameMatch[1]

  const tokenPath = info
    .split(/\s+/)
    .map(token => token.trim())
    .find(token => /[./\\][\w.-]+$/.test(token) || /\.[a-z0-9]+$/i.test(token))
  if (tokenPath) return tokenPath

  if (language === 'html') return 'index.html'
  if (language === 'css') return 'styles.css'
  if (language === 'javascript' || language === 'js') return 'app.js'
  if (language === 'json') return 'data.json'
  if (language === 'svg') return 'asset.svg'
  return null
}

function normalizeGeneratedFilePath(path: string) {
  return path.trim().replace(/\\/g, '/').replace(/^\/+/, '')
}

export function extractGeneratedBrokCodeFiles(text: string) {
  const files = new Map<string, GeneratedBrokCodeFile>()
  const fencePattern = /```([^\n`]*)\n([\s\S]*?)```/g
  let match: RegExpExecArray | null

  while ((match = fencePattern.exec(text)) !== null) {
    const info = match[1]?.trim() ?? ''
    const content = match[2]?.trim() ?? ''
    if (!content) continue

    const language = info.split(/\s+/)[0]?.toLowerCase() || null
    const rawPath = filePathFromFenceInfo(info, language)
    if (!rawPath) continue

    const path = normalizeGeneratedFilePath(rawPath)
    if (!path || path.includes('..') || path.includes('\0')) continue

    files.set(path, { path, content, language })
  }

  if (
    files.size === 0 &&
    /<!doctype html|<html[\s>]/i.test(text) &&
    /<\/html>/i.test(text)
  ) {
    files.set('index.html', {
      path: 'index.html',
      content: text.trim(),
      language: 'html'
    })
  }

  return [...files.values()]
}

export function extractGeneratedBrokCodeFileOperations(text: string) {
  const operations: GeneratedBrokCodeFileOperation[] = []
  const fencePattern = /```([^\n`]*)\n([\s\S]*?)```/g
  let match: RegExpExecArray | null

  while ((match = fencePattern.exec(text)) !== null) {
    const info = match[1]?.trim().toLowerCase() ?? ''
    const content = match[2]?.trim() ?? ''
    if (!content || !info.includes('json')) continue
    if (
      !info.includes('operation') &&
      !info.includes('patch') &&
      !content.includes('"operations"')
    ) {
      continue
    }

    try {
      const parsed = JSON.parse(content) as unknown
      const maybeOperations =
        parsed && typeof parsed === 'object'
          ? (parsed as Record<string, unknown>).operations
          : null
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(maybeOperations)
          ? maybeOperations
          : []

      for (const operation of list) {
        if (operation && typeof operation === 'object') {
          operations.push(operation as GeneratedBrokCodeFileOperation)
        }
      }
    } catch {}
  }

  return operations
}

function toReadableTitle(value: string) {
  const cleaned = value
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return 'BrokCode App'

  return cleaned
    .split(' ')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function insertBeforeHeadClose(html: string, content: string) {
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${content}\n</head>`)
  }

  return `${content}\n${html}`
}

function ensureHtmlShell(content: string, fallbackTitle: string) {
  const trimmed = content.trim()
  if (/<html[\s>]/i.test(trimmed)) return trimmed

  if (/<body[\s>]/i.test(trimmed)) {
    return `<!doctype html>\n<html lang="en">\n<head><title>${fallbackTitle}</title></head>\n${trimmed}\n</html>`
  }

  return `<!doctype html>\n<html lang="en">\n<head><title>${fallbackTitle}</title></head>\n<body>\n${trimmed}\n</body>\n</html>`
}

function ensureHtmlPreviewHygiene(
  content: string,
  fallbackTitle: string,
  hasCssFile: boolean,
  hasMissingCssReference: boolean
) {
  let html = ensureHtmlShell(content, fallbackTitle)

  if (!/^<!doctype html>/i.test(html)) {
    html = `<!doctype html>\n${html}`
  }

  if (!/<head[\s>]/i.test(html)) {
    html = html.replace(/<html([^>]*)>/i, '<html$1>\n<head></head>')
  }

  if (!/<meta\s+name=["']viewport["']/i.test(html)) {
    html = insertBeforeHeadClose(
      html,
      '<meta name="viewport" content="width=device-width, initial-scale=1" />'
    )
  }

  if (!/<title[\s>]/i.test(html)) {
    html = insertBeforeHeadClose(html, `<title>${fallbackTitle}</title>`)
  }

  const alreadyStyled =
    hasCssFile ||
    hasMissingCssReference ||
    /<style[\s>]/i.test(html) ||
    /<link[^>]+rel=["'][^"']*stylesheet/i.test(html)

  if (!alreadyStyled) {
    html = insertBeforeHeadClose(
      html,
      `<style>
* { box-sizing: border-box; }
html { min-width: 0; color-scheme: light; }
body {
  margin: 0;
  min-width: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f7f7f4;
  color: #181817;
}
img, svg, video, canvas { max-width: 100%; height: auto; }
button, input, textarea, select { font: inherit; }
a { color: inherit; }
:focus-visible { outline: 3px solid #2563eb; outline-offset: 3px; }
</style>`
    )
  }

  return html
}

function ensureCssPreviewHygiene(content: string) {
  if (content.includes('data-brokcode-preview-hygiene')) return content

  return `${content.trim()}

/* data-brokcode-preview-hygiene */
*, *::before, *::after { box-sizing: border-box; min-width: 0; }
html, body { width: 100%; max-width: 100%; overflow-x: clip; }
body > * { max-width: 100%; }
img, svg, video, canvas, iframe, table, pre, code { max-width: 100%; }
img, svg, video, canvas, iframe { height: auto; }
pre, code, table { overflow-x: auto; }
button, input, textarea, select { max-width: 100%; }
`
}

function assetReferenceFromHtmlPath(htmlPath: string, assetPath: string) {
  const clean = assetPath.trim().split(/[?#]/)[0] ?? ''
  if (
    !clean ||
    /^([a-z][a-z0-9+.-]*:)?\/\//i.test(clean) ||
    /^(data|mailto|tel):/i.test(clean) ||
    clean.startsWith('#')
  ) {
    return null
  }

  const normalized = clean.startsWith('/')
    ? normalizeGeneratedFilePath(clean)
    : normalizeGeneratedFilePath(
        `${htmlPath.includes('/') ? htmlPath.replace(/\/[^/]*$/, '/') : ''}${clean.replace(/^\.\//, '')}`
      )

  if (!normalized || normalized.includes('..') || normalized.includes('\0')) {
    return null
  }

  return normalized
}

function referencedStylesheets(file: GeneratedBrokCodeFile) {
  const refs = new Set<string>()
  const pattern =
    /<link\b(?=[^>]*\brel=["'][^"']*stylesheet[^"']*["'])(?=[^>]*\bhref=["']([^"']+\.css(?:[?#][^"']*)?)["'])[^>]*>/gi
  let match: RegExpExecArray | null

  while ((match = pattern.exec(file.content)) !== null) {
    const ref = assetReferenceFromHtmlPath(file.path, match[1] ?? '')
    if (ref) refs.add(ref)
  }

  return [...refs]
}

function referencedScripts(file: GeneratedBrokCodeFile) {
  const refs = new Set<string>()
  const pattern =
    /<script\b(?=[^>]*\bsrc=["']([^"']+\.js(?:[?#][^"']*)?)["'])[^>]*><\/script>/gi
  let match: RegExpExecArray | null

  while ((match = pattern.exec(file.content)) !== null) {
    const ref = assetReferenceFromHtmlPath(file.path, match[1] ?? '')
    if (ref) refs.add(ref)
  }

  return [...refs]
}

function buildDefaultGeneratedAppStyles() {
  return `:root {
  color-scheme: light;
  --bg: #f7f7f4;
  --surface: #ffffff;
  --surface-soft: #eef2f7;
  --text: #181817;
  --muted: #66635e;
  --line: #dedbd2;
  --accent: #2563eb;
  --accent-strong: #1746a2;
  --warm: #0f766e;
  --ink: #0f172a;
  --shadow: 0 18px 50px rgba(24, 24, 23, 0.1);
}

* { box-sizing: border-box; }

html {
  min-width: 0;
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-width: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
}

img, svg, video, canvas {
  max-width: 100%;
  height: auto;
}

a {
  color: inherit;
  text-decoration: none;
}

button, input, textarea, select {
  font: inherit;
}

button, .btn, [role="button"] {
  min-height: 44px;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
}

:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
}

.container {
  width: min(1120px, calc(100% - 32px));
  margin: 0 auto;
}

.header, header {
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1px solid rgba(222, 219, 210, 0.8);
  background: rgba(247, 247, 244, 0.92);
  backdrop-filter: blur(14px);
}

.header-inner, nav, .nav {
  display: flex;
  align-items: center;
  gap: 18px;
}

.header-inner {
  min-height: 72px;
  justify-content: space-between;
}

nav ul, .nav ul {
  display: flex;
  align-items: center;
  gap: 18px;
  margin: 0;
  padding: 0;
  list-style: none;
}

nav li, .nav li {
  margin: 0;
  padding: 0;
  list-style: none;
}

.logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-weight: 800;
}

.nav a, nav a {
  color: var(--muted);
  font-weight: 650;
}

main > section, .section, .hero {
  padding: clamp(56px, 8vw, 104px) 0;
}

.hero {
  position: relative;
  overflow: hidden;
}

.hero::after {
  content: "";
  position: absolute;
  inset: auto 0 0 auto;
  width: min(44vw, 520px);
  height: min(44vw, 520px);
  border-radius: 999px 0 0 0;
  background:
    linear-gradient(135deg, rgba(37, 99, 235, 0.16), transparent 58%),
    linear-gradient(45deg, rgba(15, 118, 110, 0.18), transparent 62%);
  pointer-events: none;
}

.hero-content, .section-header {
  position: relative;
  z-index: 1;
  max-width: 760px;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--ink);
  font-size: 0.78rem;
  font-weight: 760;
}

h1, h2, h3, p {
  margin-top: 0;
}

h1 {
  max-width: 12ch;
  font-size: clamp(3rem, 7vw, 6.5rem);
  line-height: 0.95;
}

h2 {
  font-size: clamp(2rem, 4vw, 3.5rem);
  line-height: 1;
}

p {
  color: var(--muted);
  font-size: 1.03rem;
}

.hero p {
  max-width: 58ch;
  font-size: clamp(1.05rem, 2vw, 1.28rem);
}

.hero-actions, .actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

.btn, button[type="submit"], input[type="submit"] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 20px;
  background: var(--text);
  color: #fff;
  font-weight: 760;
  box-shadow: 0 10px 24px rgba(24, 24, 23, 0.14);
}

.btn-secondary, .secondary {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--line);
}

.grid, .cards, .menu-grid, .features, .items {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 18px;
}

.card, article, .menu-card, .feature-card {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 22px;
  background: var(--surface);
  box-shadow: var(--shadow);
}

.card:nth-child(2n), article:nth-child(2n) {
  background: var(--surface-soft);
}

.card h3, article h3 {
  margin-bottom: 8px;
}

form {
  display: grid;
  gap: 12px;
  max-width: 560px;
}

input, textarea, select {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px 14px;
  background: #fff;
  color: var(--text);
}

footer, .footer {
  border-top: 1px solid var(--line);
  padding: 32px 0;
  color: var(--muted);
}

@media (max-width: 720px) {
  .container {
    width: min(100% - 24px, 1120px);
  }

  .header-inner {
    min-height: 64px;
  }

  .nav, nav {
    flex-wrap: wrap;
    gap: 10px;
  }

  main > section, .section, .hero {
    padding: 44px 0;
  }

  .hero-actions, .actions {
    flex-direction: column;
  }

  .btn, button[type="submit"], input[type="submit"] {
    width: 100%;
  }
}`
}

function buildDefaultGeneratedAppScript() {
  return `document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', event => {
      const target = document.querySelector(link.getAttribute('href'))
      if (!target) return
      event.preventDefault()
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  })

  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', event => {
      event.preventDefault()
      const button = form.querySelector('button[type="submit"], button:not([type]), input[type="submit"]')
      if (!button) return
      const original = button.textContent || button.value || 'Done'
      if ('value' in button) {
        button.value = 'Sent'
      } else {
        button.textContent = 'Sent'
      }
      window.setTimeout(() => {
        if ('value' in button) {
          button.value = original
        } else {
          button.textContent = original
        }
      }, 1800)
    })
  })

  const menuButton = document.querySelector('[aria-label*="menu" i], .mobile-menu-btn')
  const nav = document.querySelector('nav, .nav')
  if (menuButton && nav) {
    menuButton.addEventListener('click', () => {
      const expanded = menuButton.getAttribute('aria-expanded') === 'true'
      menuButton.setAttribute('aria-expanded', String(!expanded))
      nav.classList.toggle('is-open', !expanded)
    })
  }
})`
}

function buildCrmFallbackGeneratedAppScript() {
  return `document.addEventListener('DOMContentLoaded', () => {
  const search = document.querySelector('#customerSearch')
  const status = document.querySelector('#statusFilter')
  const cards = [...document.querySelectorAll('.customer-card')]

  function applyFilters() {
    const query = (search?.value || '').toLowerCase()
    const selected = status?.value || 'all'
    cards.forEach(card => {
      const matchesQuery = card.textContent.toLowerCase().includes(query)
      const matchesStatus = selected === 'all' || card.dataset.status === selected
      card.hidden = !(matchesQuery && matchesStatus)
    })
  }

  search?.addEventListener('input', applyFilters)
  status?.addEventListener('change', applyFilters)

  document.querySelector('#activityForm')?.addEventListener('submit', event => {
    event.preventDefault()
    const form = event.currentTarget
    const result = document.querySelector('#formResult')
    const customer = new FormData(form).get('customer') || 'customer'
    if (result) {
      result.textContent = \`Saved update for \${customer}. Next-action suggestion refreshed.\`
    }
  })

  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', event => {
      const target = document.querySelector(link.getAttribute('href'))
      if (!target) return
      event.preventDefault()
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  })
})`
}

export function prepareGeneratedBrokCodeFiles(
  files: GeneratedBrokCodeFile[],
  options: { fallbackTitle?: string } = {}
) {
  const existingPaths = new Set(files.map(file => file.path))
  const missingCss = new Set<string>()
  const missingScripts = new Set<string>()

  for (const file of files) {
    if (!/\.html?$/i.test(file.path)) continue

    for (const ref of referencedStylesheets(file)) {
      if (!existingPaths.has(ref)) missingCss.add(ref)
    }

    for (const ref of referencedScripts(file)) {
      if (!existingPaths.has(ref)) missingScripts.add(ref)
    }
  }

  const hasCssFile =
    files.some(file => /\.css$/i.test(file.path)) || missingCss.size > 0

  const prepared = files.map(file => {
    if (/\.css$/i.test(file.path)) {
      return {
        ...file,
        content: ensureCssPreviewHygiene(file.content)
      }
    }

    if (!/\.html?$/i.test(file.path)) return file

    return {
      ...file,
      content: ensureHtmlPreviewHygiene(
        file.content,
        options.fallbackTitle || toReadableTitle(file.path),
        hasCssFile,
        missingCss.size > 0
      )
    }
  })

  for (const path of missingCss) {
    prepared.push({
      path,
      content: buildDefaultGeneratedAppStyles(),
      language: 'css'
    })
  }

  for (const path of missingScripts) {
    prepared.push({
      path,
      content: buildDefaultGeneratedAppScript(),
      language: 'js'
    })
  }

  return prepared
}

export function shouldCreateFallbackGeneratedApp(command: string | undefined) {
  if (!command) return false
  return /\b(app|build|create|design|landing|make|page|site|ui|website)\b/i.test(
    command
  )
}

function domainTitleFromCommand(command: string | undefined) {
  const cleaned = (command ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(
      /\b(create|build|make|design|a|an|the|polished|single-page|website|landing page|app|ui|for|with|and|please)\b/gi,
      ' '
    )
    .replace(/[^a-z0-9 ]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48)

  return toReadableTitle(cleaned || 'BrokCode App')
}

export function buildFallbackGeneratedAppFiles({
  command,
  fallbackTitle
}: {
  command?: string
  fallbackTitle?: string
}): GeneratedBrokCodeFile[] {
  const title = fallbackTitle || domainTitleFromCommand(command)
  const prompt = (command ?? 'Build a useful product').trim()

  if (/\bcrm\b|\bcustomers?\b|\bcontacts?\b/i.test(prompt)) {
    return buildCrmFallbackGeneratedAppFiles({ title, prompt })
  }

  return [
    {
      path: 'index.html',
      language: 'html',
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header class="header">
      <div class="container header-inner">
        <a class="logo" href="#">${title}</a>
        <nav aria-label="Main navigation">
          <ul>
            <li><a href="#features">Features</a></li>
            <li><a href="#workflow">Workflow</a></li>
            <li><a href="#start">Start</a></li>
          </ul>
        </nav>
      </div>
    </header>
    <main>
      <section class="hero">
        <div class="container hero-content">
          <p class="eyebrow">Built from your BrokCode prompt</p>
          <h1>${title}</h1>
          <p>${escapeGeneratedHtml(prompt)}. This version starts with a real responsive product shell, a focused first workflow, and editable sections so the next iteration can improve the actual experience instead of a blank demo.</p>
          <div class="hero-actions">
            <a class="btn" href="#start">Try the flow</a>
            <a class="btn btn-secondary" href="#features">Explore features</a>
          </div>
        </div>
      </section>
      <section id="features">
        <div class="container">
          <div class="section-header">
            <h2>Useful from the first preview</h2>
            <p>Each section is structured so BrokCode can refine copy, data, forms, and interactions in the next edit loop.</p>
          </div>
          <div class="grid">
            <article class="card"><h3>Focused entry point</h3><p>A clear headline, navigation, and primary action make the first screen immediately understandable.</p></article>
            <article class="card"><h3>Responsive structure</h3><p>The layout adapts from mobile to desktop without horizontal scrolling, clipped controls, or fragile spacing.</p></article>
            <article class="card"><h3>Working interaction</h3><p>The form and navigation include JavaScript behavior so the preview feels alive and testable.</p></article>
          </div>
        </div>
      </section>
      <section id="workflow">
        <div class="container grid">
          <article class="card"><h3>1. Describe the product</h3><p>Tell BrokCode who it is for and what the first workflow should do.</p></article>
          <article class="card"><h3>2. Review the preview</h3><p>Use the live page to spot weak copy, missing states, or awkward layout.</p></article>
          <article class="card"><h3>3. Iterate fast</h3><p>Ask for concrete edits and BrokCode will update the same project files.</p></article>
        </div>
      </section>
      <section id="start">
        <div class="container">
          <form aria-label="Starter request form">
            <label>
              What should this app do next?
              <input name="request" placeholder="Add pricing, auth, dashboard, or a checkout flow" />
            </label>
            <button type="submit">Save request</button>
          </form>
        </div>
      </section>
    </main>
    <footer><div class="container">Generated by BrokCode. Ready for the next edit.</div></footer>
    <script src="app.js"></script>
  </body>
</html>`
    },
    {
      path: 'styles.css',
      language: 'css',
      content: buildDefaultGeneratedAppStyles()
    },
    {
      path: 'app.js',
      language: 'js',
      content: buildDefaultGeneratedAppScript()
    }
  ]
}

function buildCrmFallbackGeneratedAppFiles({
  title,
  prompt
}: {
  title: string
  prompt: string
}): GeneratedBrokCodeFile[] {
  return [
    {
      path: 'index.html',
      language: 'html',
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header class="header">
      <div class="container header-inner">
        <a class="logo" href="#">${title}</a>
        <nav aria-label="CRM navigation">
          <ul>
            <li><a href="#pipeline">Pipeline</a></li>
            <li><a href="#customers">Customers</a></li>
            <li><a href="#activity">Activity</a></li>
          </ul>
        </nav>
      </div>
    </header>
    <main>
      <section class="hero">
        <div class="container hero-content">
          <p class="eyebrow">Brok Build CRM preview</p>
          <h1>${title}</h1>
          <p>${escapeGeneratedHtml(prompt)}. Manage customers, notes, tasks, attachments, and admin reporting from one responsive preview.</p>
          <div class="hero-actions">
            <a class="btn" href="#customers">Review customers</a>
            <a class="btn btn-secondary" href="#activity">Log activity</a>
          </div>
        </div>
      </section>
      <section id="pipeline">
        <div class="container metrics">
          <article class="card"><span class="metric">24</span><h3>Active customers</h3><p>Health scores, owners, next actions, and recent notes are visible at a glance.</p></article>
          <article class="card"><span class="metric">$184k</span><h3>Open pipeline</h3><p>Admin reporting highlights expected value and stale follow-ups.</p></article>
          <article class="card"><span class="metric">9</span><h3>Tasks due</h3><p>Task chips keep the team focused on the next best action.</p></article>
        </div>
      </section>
      <section id="customers">
        <div class="container">
          <div class="section-header">
            <h2>Customer workspace</h2>
            <p>Search sample accounts, inspect notes and attachments, then update the mock login/status panel.</p>
          </div>
          <div class="toolbar">
            <label>Search customers <input id="customerSearch" placeholder="Search Acme, Northstar, Renewal" /></label>
            <label>Status <select id="statusFilter"><option value="all">All</option><option>Healthy</option><option>Needs follow-up</option><option>At risk</option></select></label>
          </div>
          <div class="grid customer-grid" id="customerGrid">
            <article class="card customer-card" data-status="Healthy"><h3>Acme Supply</h3><p>Health score 92. Renewal call scheduled Friday.</p><ul><li>Note: CFO asked for admin reporting.</li><li>Task: Send revised rollout plan.</li><li>Attachment: acme-contract.pdf</li></ul></article>
            <article class="card customer-card" data-status="Needs follow-up"><h3>Northstar Labs</h3><p>Health score 74. Waiting on security answers.</p><ul><li>Note: Legal review in progress.</li><li>Task: Upload SOC2 packet.</li><li>Attachment: security-checklist.xlsx</li></ul></article>
            <article class="card customer-card" data-status="At risk"><h3>Brightline Retail</h3><p>Health score 51. Support escalation open.</p><ul><li>Note: Needs implementation help.</li><li>Task: Book success session.</li><li>Attachment: support-history.csv</li></ul></article>
          </div>
        </div>
      </section>
      <section id="activity">
        <div class="container split">
          <form class="card" id="activityForm" aria-label="Log CRM activity">
            <h2>Log activity</h2>
            <label>Customer <input name="customer" value="Acme Supply" /></label>
            <label>Note <textarea name="note">Confirmed stakeholders for renewal.</textarea></label>
            <label>Next task <input name="task" value="Send follow-up deck" /></label>
            <button type="submit">Save CRM update</button>
            <p id="formResult" role="status"></p>
          </form>
          <aside class="card">
            <h2>Mock login and admin status</h2>
            <p><strong>Signed in:</strong> Revenue Ops Admin</p>
            <p><strong>Backend plan:</strong> users, customers, notes, tasks, activities, and private attachments.</p>
            <p><strong>Next action model:</strong> Suggests follow-up tasks from recent activity.</p>
          </aside>
        </div>
      </section>
    </main>
    <footer><div class="container">Generated by BrokCode. Ready for CRM edits.</div></footer>
    <script src="app.js"></script>
  </body>
</html>`
    },
    {
      path: 'styles.css',
      language: 'css',
      content: buildDefaultGeneratedAppStyles()
    },
    {
      path: 'app.js',
      language: 'js',
      content: buildCrmFallbackGeneratedAppScript()
    }
  ]
}

function escapeGeneratedHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getHtmlEntry(files: GeneratedBrokCodeFile[]) {
  return (
    files.find(file => file.path === 'index.html') ??
    files.find(file => /\.html?$/i.test(file.path)) ??
    null
  )
}

function visibleTextFromHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function inspectGeneratedBrokCodeAppQuality(
  files: GeneratedBrokCodeFile[]
): GeneratedBrokCodeQualityReport {
  const htmlEntry = getHtmlEntry(files)
  const html = htmlEntry?.content ?? ''
  const visibleText = visibleTextFromHtml(html)
  const cssFiles = files.filter(file => /\.css$/i.test(file.path))
  const cssContent = cssFiles.map(file => file.content).join('\n')
  const combined = `${html}\n${cssContent}`
  const report: GeneratedBrokCodeQualityReport = {
    hasHtmlEntry: Boolean(htmlEntry),
    hasViewport: /<meta\s+name=["']viewport["']/i.test(html),
    hasTitle: /<title[\s>][\s\S]*?<\/title>/i.test(html),
    hasStyling:
      cssFiles.length > 0 ||
      /<style[\s>]/i.test(html) ||
      /<link[^>]+rel=["'][^"']*stylesheet/i.test(html),
    hasInteraction:
      /<(button|form|input|select|textarea)\b|<a\b[^>]+href=/i.test(html),
    hasEnoughVisibleCopy: visibleText.length >= 120,
    hasPlaceholderCopy:
      /\blorem ipsum\b|\bcoming soon\b|\bplaceholder\b|\bTODO\b/i.test(
        visibleText
      ),
    issues: []
  }

  if (!report.hasHtmlEntry) report.issues.push('missing HTML entry file')
  if (!report.hasViewport) report.issues.push('missing responsive viewport')
  if (!report.hasTitle) report.issues.push('missing document title')
  if (!report.hasStyling) report.issues.push('missing styling')
  if (!report.hasInteraction) {
    report.issues.push('missing meaningful interaction')
  }
  if (!report.hasEnoughVisibleCopy) {
    report.issues.push('not enough visible product copy')
  }
  if (report.hasPlaceholderCopy) report.issues.push('contains placeholder copy')
  if (
    /(?:^|[;{\s])(?:width|min-width)\s*:\s*(?:1[1-9]\d{2,}|\d{4,})px/i.test(
      combined
    )
  ) {
    report.issues.push('contains large fixed-width layout')
  }

  return report
}
