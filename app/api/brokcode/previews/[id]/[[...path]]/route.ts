import { NextResponse } from 'next/server'

import {
  enforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'
import {
  getManagedPreviewAsset,
  getManagedPreviewAssetOrPlaceholder,
  managedPreviewSecurityHeaders
} from '@/lib/brokcode/preview'
import {
  getBrokCodeProject,
  getBrokCodeProjectById,
  listBrokCodeProjectFiles,
  listBrokCodeProjectFilesByProjectId
} from '@/lib/brokcode/project-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function authorizeProject(request: Request, id: string) {
  const { authResult } = await resolveBrokCodeRequestAuth(request, {
    allowBrowserSession: true
  })
  if (!authResult.success) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }
  }

  const accountMismatch = await enforceBrokCodeAccountOwnership(authResult)
  if (accountMismatch) {
    return { ok: false as const, response: accountMismatch }
  }

  const project = await getBrokCodeProject({
    id,
    workspaceId: authResult.workspace.id,
    userId: authResult.apiKey.userId
  })
  if (!project) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }
  }

  return { ok: true as const, authResult, project }
}

async function getPublicPreviewProject(id: string) {
  const project = await getBrokCodeProjectById({ id })
  if (!project) return null

  const isPreviewReady =
    project.status === 'deployed' || Boolean(project.deploymentUrl)
  if (!isPreviewReady) return null

  return project
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; path?: string[] }> }
) {
  const { id, path } = await params
  const publicProject = await getPublicPreviewProject(id)

  if (publicProject) {
    const files = await listBrokCodeProjectFilesByProjectId({
      projectId: publicProject.id
    })
    const asset = getManagedPreviewAsset({
      files,
      pathParts: path,
      project: publicProject
    })

    if (asset) {
      return new NextResponse(asset.content, {
        status: asset.status,
        headers: {
          ...managedPreviewSecurityHeaders(asset),
          'X-BrokCode-Preview-Path': asset.path
        }
      })
    }
  }

  const access = await authorizeProject(request, id)
  if (!access.ok) return access.response

  const files = await listBrokCodeProjectFiles({
    projectId: access.project.id,
    workspaceId: access.authResult.workspace.id
  })
  const asset = getManagedPreviewAssetOrPlaceholder({
    files,
    pathParts: path,
    project: access.project
  })

  if (!asset) {
    return new NextResponse('Preview file not found.', {
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
      ...managedPreviewSecurityHeaders(asset),
      'X-BrokCode-Preview-Path': asset.path
    }
  })
}
