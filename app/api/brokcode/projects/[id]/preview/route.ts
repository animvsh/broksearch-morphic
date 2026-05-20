import { NextResponse } from 'next/server'

import {
  enforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'
import { publicBrokCodeBackendMetadata } from '@/lib/brokcode/backend-provider'
import {
  makeManagedPreviewUrl,
  resolvePublicPreviewOrigin
} from '@/lib/brokcode/preview'
import {
  getBrokCodeProject,
  listBrokCodeProjectFiles,
  updateBrokCodeProjectPreview
} from '@/lib/brokcode/project-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function publicProject<T extends { metadata?: Record<string, unknown> | null }>(
  project: T
) {
  return {
    ...project,
    metadata: {
      ...(project.metadata ?? {}),
      backend: publicBrokCodeBackendMetadata(project.metadata?.backend)
    }
  }
}

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await authorizeProject(request, id)
  if (!access.ok) return access.response

  const files = await listBrokCodeProjectFiles({
    projectId: access.project.id,
    workspaceId: access.authResult.workspace.id
  })
  const previewUrl = makeManagedPreviewUrl({
    origin: resolvePublicPreviewOrigin(request),
    projectId: access.project.id
  })
  const project = await updateBrokCodeProjectPreview({
    projectId: access.project.id,
    workspaceId: access.authResult.workspace.id,
    userId: access.authResult.apiKey.userId,
    previewUrl,
    metadata: {
      mode: 'managed_live_preview',
      fileCount: files.length,
      generatedAt: new Date().toISOString(),
      hotReload: true
    }
  })

  return NextResponse.json({
    status: 'ready',
    strategy: 'managed_live_preview',
    message: 'Managed BrokCode preview is ready.',
    previewUrl,
    deploymentPreviewUrl: previewUrl,
    fileCount: files.length,
    project: project ? publicProject(project) : publicProject(access.project)
  })
}
