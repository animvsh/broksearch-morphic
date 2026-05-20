import { NextResponse } from 'next/server'

import { getManagedPreviewAsset } from '@/lib/brokcode/preview'
import {
  getBrokCodeProjectByHandle,
  listBrokCodeProjectFilesByProjectId
} from '@/lib/brokcode/project-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isPublicBrokCodeApp(project: {
  status: string
  previewUrl?: string | null
  deploymentUrl?: string | null
}) {
  return (
    project.status === 'preview_ready' ||
    project.status === 'deployed' ||
    Boolean(project.previewUrl) ||
    Boolean(project.deploymentUrl)
  )
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handle: string; path?: string[] }> }
) {
  const { handle, path } = await params
  const project = await getBrokCodeProjectByHandle({ handle })

  if (!project || !isPublicBrokCodeApp(project)) {
    return new NextResponse('BrokCode app not found.', {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8'
      }
    })
  }

  const files = await listBrokCodeProjectFilesByProjectId({
    projectId: project.id
  })
  const asset = getManagedPreviewAsset({
    files,
    pathParts: path,
    project
  })

  if (!asset) {
    return new NextResponse('BrokCode app file not found.', {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8'
      }
    })
  }

  return new NextResponse(asset.content, {
    status: asset.status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': asset.contentType,
      'X-BrokCode-App-Path': asset.path,
      'X-BrokCode-Project': project.id
    }
  })
}
