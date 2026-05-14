import { NextRequest, NextResponse } from 'next/server'

import { existsSync } from 'fs'
import path from 'path'

import { getLocalStorageRoots } from '@/lib/storage/local-storage-config'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathParts } = await params
  const filePath = pathParts.join('/')
  const candidates = getLocalStorageRoots().map(storageRoot => {
    const resolvedRoot = path.resolve(/*turbopackIgnore: true*/ storageRoot)
    return {
      fullPath: path.resolve(resolvedRoot, filePath),
      storageRoot: resolvedRoot
    }
  })

  // Security: prevent directory traversal
  if (
    candidates.some(
      candidate =>
        candidate.fullPath === candidate.storageRoot ||
        !candidate.fullPath.startsWith(`${candidate.storageRoot}${path.sep}`)
    )
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const candidate = candidates.find(candidate => existsSync(candidate.fullPath))

  if (!candidate) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { fullPath } = candidate

  if (!existsSync(fullPath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { readFile } = await import('fs/promises')
  const file = await readFile(fullPath)

  const ext = path.extname(filePath).toLowerCase()
  const contentTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8'
  }

  const contentType = contentTypes[ext] || 'application/octet-stream'

  return new NextResponse(new Uint8Array(file), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600'
    }
  })
}
