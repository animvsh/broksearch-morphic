import { createRequire } from 'module'

type PdfParseResult = {
  text?: string
  numpages?: number
}

type PdfParse = (buffer: Buffer) => Promise<PdfParseResult>

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as PdfParse

const MAX_EXTRACTED_TEXT_CHARS = 30_000

export type UploadedFileTextExtraction = {
  text?: string
  charCount: number
  truncated: boolean
  pageCount?: number
  status: 'skipped' | 'extracted' | 'empty' | 'failed'
  error?: string
}

function cleanExtractedText(text: string) {
  return text
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

function trimForChat(text: string) {
  if (text.length <= MAX_EXTRACTED_TEXT_CHARS) {
    return { text, truncated: false }
  }

  return {
    text: `${text.slice(
      0,
      MAX_EXTRACTED_TEXT_CHARS
    )}\n\n[File content truncated for faster analysis]`,
    truncated: true
  }
}

export async function extractUploadedFileText(
  file: File,
  parsePdf: PdfParse = pdfParse
): Promise<UploadedFileTextExtraction> {
  if (file.type !== 'application/pdf') {
    return { status: 'skipped', charCount: 0, truncated: false }
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await parsePdf(buffer)
    const cleaned = cleanExtractedText(result.text || '')

    if (!cleaned) {
      return {
        status: 'empty',
        charCount: 0,
        truncated: false,
        pageCount: result.numpages
      }
    }

    const trimmed = trimForChat(cleaned)

    return {
      status: 'extracted',
      text: trimmed.text,
      charCount: cleaned.length,
      truncated: trimmed.truncated,
      pageCount: result.numpages
    }
  } catch (error) {
    return {
      status: 'failed',
      charCount: 0,
      truncated: false,
      error: error instanceof Error ? error.message : 'PDF extraction failed'
    }
  }
}
