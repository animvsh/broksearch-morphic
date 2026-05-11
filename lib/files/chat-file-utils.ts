const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png'])
const UPLOADABLE_BINARY_MIME_TYPES = new Set([
  ...IMAGE_MIME_TYPES,
  'application/pdf'
])

const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/ld+json',
  'application/markdown',
  'application/x-ndjson',
  'application/xml',
  'text/csv',
  'text/html',
  'text/markdown',
  'text/plain',
  'text/xml'
])

const TEXT_EXTENSIONS = new Set([
  'csv',
  'html',
  'htm',
  'js',
  'jsx',
  'json',
  'log',
  'md',
  'mdx',
  'mjs',
  'py',
  'sql',
  'svg',
  'ts',
  'tsx',
  'txt',
  'xml',
  'yaml',
  'yml'
])

const MAX_TEXT_EXTRACT_BYTES = 200_000
const MAX_TEXT_EXTRACT_CHARS = 20_000

export const CHAT_MAX_FILES = 3
export const CHAT_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
export const CHAT_FILE_INPUT_ACCEPT = [
  '.csv',
  '.html',
  '.htm',
  '.js',
  '.jsx',
  '.json',
  '.log',
  '.md',
  '.mdx',
  '.mjs',
  '.pdf',
  '.py',
  '.sql',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
  'application/json',
  'application/pdf',
  'text/*',
  'image/png',
  'image/jpeg'
].join(',')

function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.')
  return dotIndex === -1 ? '' : fileName.slice(dotIndex + 1).toLowerCase()
}

export function isTextLikeFile(file: File): boolean {
  const mimeType = file.type.toLowerCase()
  if (mimeType.startsWith('text/')) return true
  if (TEXT_MIME_TYPES.has(mimeType)) return true
  const extension = getFileExtension(file.name)
  return TEXT_EXTENSIONS.has(extension)
}

export function isUploadableBinaryFile(file: File): boolean {
  return UPLOADABLE_BINARY_MIME_TYPES.has(file.type.toLowerCase())
}

export function isAcceptedChatFile(file: File): boolean {
  return isTextLikeFile(file) || isUploadableBinaryFile(file)
}

export async function extractTextForChat(
  file: File
): Promise<string | undefined> {
  if (!isTextLikeFile(file)) return undefined

  const byteWindow =
    file.size > MAX_TEXT_EXTRACT_BYTES
      ? file.slice(0, MAX_TEXT_EXTRACT_BYTES)
      : file
  const rawText = await byteWindow.text()
  const cleaned = rawText.replace(/\u0000/g, '').trim()

  if (!cleaned) return undefined

  const charTrimmed =
    cleaned.length > MAX_TEXT_EXTRACT_CHARS
      ? cleaned.slice(0, MAX_TEXT_EXTRACT_CHARS)
      : cleaned

  const wasTruncated =
    file.size > MAX_TEXT_EXTRACT_BYTES ||
    cleaned.length > MAX_TEXT_EXTRACT_CHARS

  if (!wasTruncated) return charTrimmed

  return `${charTrimmed}\n\n[File content truncated for faster analysis]`
}
