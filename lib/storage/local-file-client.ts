import { existsSync } from 'fs'
import { mkdir, stat,unlink, writeFile } from 'fs/promises'
import path from 'path'

export const LOCAL_STORAGE_PATH = process.env.LOCAL_STORAGE_PATH || '/var/data/uploads'
export const LOCAL_PUBLIC_URL = process.env.LOCAL_PUBLIC_URL || 'http://localhost:8080/api/uploads'

export interface UploadedFile {
  filename: string
  url: string
  mediaType: string
  type: string
}

export async function ensureStorageDir(userId: string, chatId: string): Promise<string> {
  const dirPath = path.join(LOCAL_STORAGE_PATH, userId, 'chats', chatId)
  await mkdir(dirPath, { recursive: true })
  return dirPath
}

export async function uploadFileLocal(
  file: File,
  userId: string,
  chatId: string
): Promise<UploadedFile> {
  const sanitizedFileName = sanitizeFilename(file.name)
  const timestamp = Date.now()
  const filePath = `${userId}/chats/${chatId}/${timestamp}-${sanitizedFileName}`
  const fullDirPath = path.join(LOCAL_STORAGE_PATH, userId, 'chats', chatId)
  const fullFilePath = path.join(fullDirPath, `${timestamp}-${sanitizedFileName}`)

  await mkdir(fullDirPath, { recursive: true })

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(fullFilePath, buffer)

  const publicUrl = `${LOCAL_PUBLIC_URL.replace(/\/+$/, '')}/${filePath}`

  return {
    filename: file.name,
    url: publicUrl,
    mediaType: file.type,
    type: 'file'
  }
}

export async function deleteFileLocal(filePath: string): Promise<void> {
  const fullPath = path.join(LOCAL_STORAGE_PATH, filePath)
  if (existsSync(fullPath)) {
    await unlink(fullPath)
  }
}

export async function getFileStatsLocal(filePath: string): Promise<{ size: number } | null> {
  const fullPath = path.join(LOCAL_STORAGE_PATH, filePath)
  if (!existsSync(fullPath)) {
    return null
  }
  const stats = await stat(fullPath)
  return { size: stats.size }
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-z0-9.\-_]/gi, '_').toLowerCase()
}
