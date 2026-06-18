import { NextResponse } from 'next/server'

import {
  getManagedPreviewAsset,
  hasRenderableManagedPreview,
  managedPreviewSecurityHeaders
} from '@/lib/brokcode/preview'
import {
  getBrokCodeProjectByHandle,
  getLatestBrokCodeDeploymentFileSnapshot,
  listBrokCodeProjectDeployments
} from '@/lib/brokcode/project-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isPublicBrokCodeApp(project: {
  status: string
  previewUrl?: string | null
  deploymentUrl?: string | null
}) {
  return project.status === 'deployed' || Boolean(project.deploymentUrl)
}

function injectAppBaseHref({
  content,
  handle
}: {
  content: string
  handle: string
}) {
  if (/<base\s/i.test(content)) return content

  const baseHref = `/brokcode/apps/${encodeURIComponent(handle)}/`
  const baseTag = `<base href="${baseHref}">`

  if (/<head[^>]*>/i.test(content)) {
    return content.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`)
  }

  return `${baseTag}${content}`
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

  const managedDeployments = (
    await listBrokCodeProjectDeployments({
      projectId: project.id,
      workspaceId: project.workspaceId,
      userId: project.userId,
      maxResults: 25
    })
  ).filter(
    deployment =>
      deployment.provider === 'managed_preview' &&
      deployment.status === 'deployed'
  )
  if (managedDeployments.length === 0) {
    return new NextResponse('BrokCode app has no published snapshot.', {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8'
      }
    })
  }

  const files = await getLatestBrokCodeDeploymentFileSnapshot({
    projectId: project.id,
    workspaceId: project.workspaceId,
    userId: project.userId
  })
  if (files.length === 0) {
    return new NextResponse('BrokCode app has no published snapshot.', {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8'
      }
    })
  }
  if (!hasRenderableManagedPreview(files)) {
    return new NextResponse(
      'BrokCode app published snapshot has no renderable index.html.',
      {
        status: 404,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/plain; charset=utf-8'
        }
      }
    )
  }
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

  const content = asset.contentType.startsWith('text/html')
    ? injectAppBaseHref({ content: asset.content, handle })
    : asset.content

  return new NextResponse(content, {
    status: asset.status,
    headers: {
      ...managedPreviewSecurityHeaders(asset),
      'X-BrokCode-App-Path': asset.path,
      'X-BrokCode-Project': project.id
    }
  })
}
