export type GeneratedBrokCodeFile = {
  path: string
  content: string
  language: string | null
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
