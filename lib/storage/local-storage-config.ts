import path from 'path'

export const FALLBACK_LOCAL_STORAGE_PATH = path.join(
  process.cwd(),
  '.data/uploads'
)

export const LOCAL_STORAGE_PATH =
  process.env.LOCAL_STORAGE_PATH || FALLBACK_LOCAL_STORAGE_PATH

export const LOCAL_PUBLIC_URL = process.env.LOCAL_PUBLIC_URL || '/api/uploads'

export function getLocalStorageRoots() {
  return Array.from(new Set([LOCAL_STORAGE_PATH, FALLBACK_LOCAL_STORAGE_PATH]))
}
