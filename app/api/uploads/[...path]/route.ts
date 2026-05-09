import { NextRequest, NextResponse } from 'next/server'

import { existsSync } from 'fs'
import path from 'path'

import { LOCAL_STORAGE_PATH } from '@/lib/storage/local-file-client'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathParts } = await params
  const filePath = pathParts.join('/')
  const fullPath = path.join(LOCAL_STORAGE_PATH, filePath)

  // Security: prevent directory traversal
  if (!fullPath.startsWith(LOCAL_STORAGE_PATH)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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
    '.pdf': 'application/pdf'
  }

  const contentType = contentTypes[ext] || 'application/octet-stream'

  return new NextResponse(new Uint8Array(file), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600'
    }
  })
}
