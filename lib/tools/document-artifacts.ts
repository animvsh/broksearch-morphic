import { tool } from 'ai'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { z } from 'zod'

import {
  LOCAL_PUBLIC_URL,
  LOCAL_STORAGE_PATH
} from '@/lib/storage/local-storage-config'

const documentFormatSchema = z.enum(['pdf', 'doc', 'html', 'markdown', 'txt'])

const documentArtifactInputSchema = z.object({
  title: z.string().min(1).max(140).describe('Document title.'),
  content: z
    .string()
    .min(1)
    .max(80_000)
    .describe('Complete document body to write into the generated file.'),
  formats: z
    .array(documentFormatSchema)
    .min(1)
    .max(5)
    .default(['pdf'])
    .describe('Document formats to create.'),
  summary: z
    .string()
    .max(500)
    .optional()
    .describe('Short human-readable summary of the generated document.')
})

type DocumentFormat = z.infer<typeof documentFormatSchema>

const MIME_TYPES: Record<DocumentFormat, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  html: 'text/html',
  markdown: 'text/markdown',
  txt: 'text/plain'
}

const EXTENSIONS: Record<DocumentFormat, string> = {
  pdf: 'pdf',
  doc: 'doc',
  html: 'html',
  markdown: 'md',
  txt: 'txt'
}

function sanitizeFilename(value: string) {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return cleaned || 'brok-document'
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapePdfText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function wrapText(value: string, lineLength = 92) {
  const lines: string[] = []

  for (const paragraph of value.replace(/\r\n/g, '\n').split('\n')) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push('')
      continue
    }

    let line = ''
    for (const word of words) {
      if (!line) {
        line = word
      } else if (`${line} ${word}`.length <= lineLength) {
        line = `${line} ${word}`
      } else {
        lines.push(line)
        line = word
      }
    }
    if (line) lines.push(line)
  }

  return lines
}

function createPdfBuffer(title: string, content: string) {
  const lines = wrapText(`${title}\n\n${content}`)
  const pages: string[][] = []
  for (let index = 0; index < lines.length; index += 52) {
    pages.push(lines.slice(index, index + 52))
  }
  if (pages.length === 0) pages.push([title])

  const objects: string[] = []
  const addObject = (body: string) => {
    objects.push(body)
    return objects.length
  }

  const catalogId = addObject('<< /Type /Catalog /Pages 2 0 R >>')
  const pagesId = addObject('PAGES_PLACEHOLDER')
  const fontId = addObject(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  )
  const pageIds: number[] = []

  for (const pageLines of pages) {
    const stream = [
      'BT',
      '/F1 12 Tf',
      '50 760 Td',
      '14 TL',
      ...pageLines.map(line => `(${escapePdfText(line)}) Tj T*`),
      'ET'
    ].join('\n')
    const contentId = addObject(
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
    )
    const pageId = addObject(
      [
        '<< /Type /Page',
        `/Parent ${pagesId} 0 R`,
        '/MediaBox [0 0 612 792]',
        `/Resources << /Font << /F1 ${fontId} 0 R >> >>`,
        `/Contents ${contentId} 0 R`,
        '>>'
      ].join(' ')
    )
    pageIds.push(pageId)
  }

  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`

  let output = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(output))
    output += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`
  }

  const xrefOffset = Buffer.byteLength(output)
  output += `xref\n0 ${objects.length + 1}\n`
  output += '0000000000 65535 f \n'
  for (let index = 1; index < offsets.length; index++) {
    output += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  return Buffer.from(output, 'binary')
}

function createHtmlDocument(title: string, content: string) {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8" />',
    `<title>${escapeHtml(title)}</title>`,
    '<style>body{font-family:Arial,sans-serif;line-height:1.55;margin:48px;max-width:760px} h1{font-size:28px} p{white-space:pre-wrap}</style>',
    '</head>',
    '<body>',
    `<h1>${escapeHtml(title)}</h1>`,
    `<p>${escapeHtml(content)}</p>`,
    '</body>',
    '</html>'
  ].join('\n')
}

function createMarkdownDocument(title: string, content: string) {
  return `# ${title}\n\n${content.trim()}\n`
}

function renderDocument(
  format: DocumentFormat,
  title: string,
  content: string
) {
  if (format === 'pdf') return createPdfBuffer(title, content)
  if (format === 'doc' || format === 'html') {
    return Buffer.from(createHtmlDocument(title, content), 'utf8')
  }
  if (format === 'markdown') {
    return Buffer.from(createMarkdownDocument(title, content), 'utf8')
  }
  return Buffer.from(`${title}\n\n${content.trim()}\n`, 'utf8')
}

export function createDocumentArtifactTool({
  userId,
  chatId
}: {
  userId?: string
  chatId?: string
}) {
  return tool({
    description:
      'Create real downloadable document artifacts from chat content, including PDF, Word-compatible .doc, HTML, Markdown, and text files. Use when the user asks to create, draft, export, or generate a document/PDF.',
    inputSchema: documentArtifactInputSchema,
    async *execute({ title, content, formats, summary }) {
      yield {
        state: 'creating' as const,
        title,
        formats
      }

      const owner = sanitizeFilename(userId || 'guest')
      const conversation = sanitizeFilename(chatId || 'default')
      const timestamp = Date.now()
      const slug = sanitizeFilename(title).slice(0, 80)
      const relativeDir = path.join(owner, 'chats', conversation, 'generated')
      const storageDir = path.join(
        /*turbopackIgnore: true*/ LOCAL_STORAGE_PATH,
        relativeDir
      )
      await mkdir(storageDir, { recursive: true })

      const files = await Promise.all(
        [...new Set(formats)].map(async format => {
          const filename = `${timestamp}-${slug}.${EXTENSIONS[format]}`
          const relativePath = `${relativeDir}/${filename}`.replace(/\\/g, '/')
          const buffer = renderDocument(format, title, content)
          await writeFile(path.join(storageDir, filename), buffer)
          return {
            format,
            filename,
            url: `${LOCAL_PUBLIC_URL.replace(/\/+$/, '')}/${relativePath}`,
            mediaType: MIME_TYPES[format],
            bytes: buffer.byteLength
          }
        })
      )

      yield {
        state: 'complete' as const,
        success: true,
        title,
        summary: summary || `Created ${files.length} document artifact(s).`,
        files
      }
    }
  })
}
