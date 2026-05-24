import { NextResponse } from 'next/server'

import {
  enforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'
import { publicBrokCodeBackendMetadata } from '@/lib/brokcode/backend-provider'
import {
  hasRenderableManagedPreview,
  makeManagedPreviewUrl,
  resolvePublicPreviewOrigin
} from '@/lib/brokcode/preview'
import {
  getBrokCodeProject,
  listBrokCodeProjectFiles,
  updateBrokCodeProjectPreview
} from '@/lib/brokcode/project-store'
import { createBrokCodeRuntimeSpec } from '@/lib/brokcode/runtime/contract'
import { startBrokCodeRuntimeProcess } from '@/lib/brokcode/runtime/process-manager'
import {
  createBrokCodeRuntimeSandbox,
  getLatestBrokCodeRuntimeSandbox
} from '@/lib/brokcode/runtime/store'
import {
  BrokCodeRuntimeWorkspaceError,
  materializeBrokCodeRuntimeWorkspace
} from '@/lib/brokcode/runtime/workspace'

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
  const runtimeSpec = createBrokCodeRuntimeSpec({
    projectId: access.project.id,
    workspaceId: access.authResult.workspace.id,
    userId: access.authResult.apiKey.userId,
    files,
    status: 'running'
  })
  if (
    runtimeSpec.appType === 'vite_react' ||
    runtimeSpec.appType === 'nextjs'
  ) {
    try {
      const workspace = await materializeBrokCodeRuntimeWorkspace({
        spec: runtimeSpec,
        files,
        projectName: access.project.name
      })
      const specWithWorkspace = {
        ...runtimeSpec,
        metadata: {
          ...runtimeSpec.metadata,
          workspace: workspace.manifest
        }
      }
      const runtime =
        (await getLatestBrokCodeRuntimeSandbox({
          projectId: access.project.id,
          workspaceId: access.authResult.workspace.id,
          userId: access.authResult.apiKey.userId
        })) ??
        (await createBrokCodeRuntimeSandbox({
          spec: specWithWorkspace
        }))
      const processEntry = await startBrokCodeRuntimeProcess({
        runtime,
        manifest: workspace.manifest
      })
      if (processEntry?.status === 'ready') {
        const previewUrl = `${resolvePublicPreviewOrigin(request)}/api/brokcode/runtime/${encodeURIComponent(runtime.id)}/`
        return NextResponse.json({
          status: 'ready',
          strategy: 'live_runtime',
          message: 'BrokCode live runtime preview is ready.',
          previewUrl,
          deploymentPreviewUrl: previewUrl,
          fileCount: workspace.manifest.files.length,
          runtime,
          workspace: workspace.manifest,
          project: publicProject(access.project)
        })
      }
    } catch (error) {
      if (error instanceof BrokCodeRuntimeWorkspaceError) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      console.error('BrokCode live runtime start failed:', error)
    }
  }

  if (!hasRenderableManagedPreview(files)) {
    return NextResponse.json(
      {
        error:
          'BrokCode preview is not ready because this project does not have a renderable index.html yet.'
      },
      { status: 422 }
    )
  }
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
