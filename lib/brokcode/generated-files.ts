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
  --surface-soft: #f0eee8;
  --text: #181817;
  --muted: #66635e;
  --line: #dedbd2;
  --accent: #2563eb;
  --accent-strong: #1746a2;
  --warm: #d97706;
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

.hero-content, .section-header {
  max-width: 760px;
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
  border-radius: 14px;
  padding: 22px;
  background: var(--surface);
  box-shadow: var(--shadow);
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
          <p>${escapeGeneratedHtml(prompt)}. This first version gives the app a real responsive shell, clear actions, and editable sections so the next iteration has something concrete to improve.</p>
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
            <article class="card"><h3>Focused homepage</h3><p>A clear hero, navigation, and primary action give the app direction immediately.</p></article>
            <article class="card"><h3>Responsive layout</h3><p>The layout adapts from mobile to desktop without horizontal scrolling or clipped controls.</p></article>
            <article class="card"><h3>Working interaction</h3><p>The form and navigation include JavaScript behavior so the preview feels alive.</p></article>
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
  if (/(?:width|min-width)\s*:\s*(?:1[1-9]\d{2,}|\d{4,})px/i.test(combined)) {
    report.issues.push('contains large fixed-width layout')
  }

  return report
}
