import { existsSync } from 'fs'
import { mkdir, stat, unlink, writeFile } from 'fs/promises'
import path from 'path'

import {
  FALLBACK_LOCAL_STORAGE_PATH,
  getLocalStorageRoots,
  LOCAL_PUBLIC_URL,
  LOCAL_STORAGE_PATH
} from '@/lib/storage/local-storage-config'

export { LOCAL_PUBLIC_URL, LOCAL_STORAGE_PATH }

export interface UploadedFile {
  filename: string
  url: string
  mediaType: string
  type: string
}

export async function ensureStorageDir(
  userId: string,
  chatId: string
): Promise<string> {
  const dirPath = await resolveWritableStorageDir(userId, chatId)
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
  const storageRoot = await resolveWritableStorageRoot(userId, chatId)
  const fullDirPath = path.join(storageRoot, userId, 'chats', chatId)
  const fullFilePath = path.join(
    fullDirPath,
    `${timestamp}-${sanitizedFileName}`
  )

  await mkdir(fullDirPath, { recursive: true })

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(fullFilePath, buffer)

  const publicBaseUrl =
    storageRoot === FALLBACK_LOCAL_STORAGE_PATH
      ? '/api/uploads'
      : LOCAL_PUBLIC_URL
  const publicUrl = `${publicBaseUrl.replace(/\/+$/, '')}/${filePath}`

  return {
    filename: file.name,
    url: publicUrl,
    mediaType: file.type,
    type: 'file'
  }
}

export async function deleteFileLocal(filePath: string): Promise<void> {
  for (const storageRoot of getLocalStorageRoots()) {
    const fullPath = path.join(/*turbopackIgnore: true*/ storageRoot, filePath)
    if (existsSync(fullPath)) {
      await unlink(fullPath)
      return
    }
  }
}

export async function getFileStatsLocal(
  filePath: string
): Promise<{ size: number } | null> {
  for (const storageRoot of getLocalStorageRoots()) {
    const fullPath = path.join(/*turbopackIgnore: true*/ storageRoot, filePath)
    if (existsSync(fullPath)) {
      const stats = await stat(fullPath)
      return { size: stats.size }
    }
  }

  return null
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-z0-9.\-_]/gi, '_').toLowerCase()
}

async function resolveWritableStorageDir(userId: string, chatId: string) {
  const storageRoot = await resolveWritableStorageRoot(userId, chatId)
  return path.join(storageRoot, userId, 'chats', chatId)
}

async function resolveWritableStorageRoot(userId: string, chatId: string) {
  for (const storageRoot of getLocalStorageRoots()) {
    const candidateDir = path.join(storageRoot, userId, 'chats', chatId)
    try {
      await mkdir(candidateDir, { recursive: true })
      return storageRoot
    } catch (error) {
      if (!isWritableStorageError(error)) {
        throw error
      }
    }
  }

  throw new Error('No writable local upload storage path is available.')
}

function isWritableStorageError(error: unknown) {
  if (!(error instanceof Error) || !('code' in error)) return false
  return ['EACCES', 'EPERM', 'EROFS', 'ENOENT'].includes(
    String((error as NodeJS.ErrnoException).code)
  )
}
