import { NextResponse } from 'next/server'

import {
  enforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'
import {
  getBrokCodeProject,
  listBrokCodeProjectFiles
} from '@/lib/brokcode/project-store'
import {
  BROKCODE_RUNTIME_APP_TYPES,
  BrokCodeRuntimeHealth,
  BrokCodeRuntimeStatus,
  createBrokCodeRuntimeSpec,
  getBrokCodeRuntimeStartReadiness
} from '@/lib/brokcode/runtime/contract'
import { startBrokCodeRuntimeProcess } from '@/lib/brokcode/runtime/process-manager'
import {
  createBrokCodeRuntimeSandbox,
  getLatestBrokCodeRuntimeSandbox,
  listBrokCodeRuntimeSandboxes,
  refreshBrokCodeRuntimeSandbox,
  updateBrokCodeRuntimeSandbox
} from '@/lib/brokcode/runtime/store'
import {
  BrokCodeRuntimeWorkspaceError,
  materializeBrokCodeRuntimeWorkspace
} from '@/lib/brokcode/runtime/workspace'

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

function runtimeFallback(spec?: { appType?: unknown } | null) {
  if (
    spec &&
    typeof spec.appType === 'string' &&
    BROKCODE_RUNTIME_APP_TYPES.includes(
      spec.appType as (typeof BROKCODE_RUNTIME_APP_TYPES)[number]
    )
  ) {
    const readiness = getBrokCodeRuntimeStartReadiness(
      spec.appType as (typeof BROKCODE_RUNTIME_APP_TYPES)[number]
    )
    if (readiness.mode === 'managed_static_preview') {
      return {
        mode: readiness.mode,
        enabled: true,
        message: readiness.message
      }
    }
    if (readiness.mode === 'unsupported') {
      return {
        mode: readiness.mode,
        enabled: false,
        message: readiness.message
      }
    }
  }

  return {
    mode: 'managed_static_preview',
    enabled: true,
    message:
      'Managed static preview remains available until live runtime starts.'
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await authorizeProject(request, id)
  if (!access.ok) return access.response

  const runtimes = await listBrokCodeRuntimeSandboxes({
    projectId: access.project.id,
    workspaceId: access.authResult.workspace.id,
    userId: access.authResult.apiKey.userId
  })

  return NextResponse.json({
    runtime: runtimes[0] ?? null,
    runtimes,
    fallback: runtimeFallback(runtimes[0] ?? null)
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await authorizeProject(request, id)
  if (!access.ok) return access.response

  const body = (await request.json().catch(() => null)) as {
    versionId?: unknown
    sessionId?: unknown
    context?: unknown
    status?: unknown
    force?: unknown
    start?: unknown
  } | null
  const files = await listBrokCodeProjectFiles({
    projectId: access.project.id,
    workspaceId: access.authResult.workspace.id
  })
  const context =
    body?.context && typeof body.context === 'object'
      ? (body.context as Record<string, string | null | undefined>)
      : null
  const spec = createBrokCodeRuntimeSpec({
    projectId: access.project.id,
    workspaceId: access.authResult.workspace.id,
    userId: access.authResult.apiKey.userId,
    versionId:
      typeof body?.versionId === 'string' ? body.versionId.trim() : null,
    sessionId:
      typeof body?.sessionId === 'string' ? body.sessionId.trim() : null,
    context,
    files,
    status: body?.status
  })
  let materialized: Awaited<
    ReturnType<typeof materializeBrokCodeRuntimeWorkspace>
  >
  try {
    materialized = await materializeBrokCodeRuntimeWorkspace({
      spec,
      files,
      projectName: access.project.name
    })
  } catch (error) {
    if (error instanceof BrokCodeRuntimeWorkspaceError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    throw error
  }
  const runtimeSpec = {
    ...spec,
    appType: materialized.manifest.appType,
    packageManager: materialized.manifest.packageManager,
    workspacePath: materialized.workspacePath,
    installCommand: materialized.manifest.installCommand,
    devCommand: materialized.manifest.devCommand,
    buildCommand: materialized.manifest.buildCommand,
    metadata: {
      ...spec.metadata,
      workspace: materialized.manifest
    }
  }
  const latest =
    body?.force === true
      ? null
      : await getLatestBrokCodeRuntimeSandbox({
          projectId: access.project.id,
          workspaceId: access.authResult.workspace.id,
          userId: access.authResult.apiKey.userId
        })
  const runtime =
    latest && latest.versionId === spec.versionId
      ? await updateBrokCodeRuntimeSandbox({
          id: latest.id,
          workspaceId: access.authResult.workspace.id,
          userId: access.authResult.apiKey.userId,
          metadata: runtimeSpec.metadata
        })
      : await createBrokCodeRuntimeSandbox({
          spec: runtimeSpec
        })
  const livePreview =
    body?.start === true && runtime
      ? await startBrokCodeRuntimeProcess({
          runtime,
          manifest: materialized.manifest
        })
      : null
  const refreshedRuntime = await refreshBrokCodeRuntimeSandbox(runtime)
  const fallbackRuntime = (refreshedRuntime ?? runtime ?? runtimeSpec) as Record<
    string,
    unknown
  > | null

  return NextResponse.json({
    runtime: refreshedRuntime,
    spec: runtimeSpec,
    workspace: materialized.manifest,
    livePreview: livePreview
      ? ((refreshedRuntime?.metadata?.livePreview as
          | Record<string, unknown>
          | undefined) ?? {
          status: livePreview.status,
          port: livePreview.port,
          previewUrl: `/api/brokcode/runtime/${encodeURIComponent(livePreview.runtimeId)}/`
        })
      : ((refreshedRuntime?.metadata?.livePreview as
          | Record<string, unknown>
          | undefined) ?? null),
    fallback: runtimeFallback(fallbackRuntime)
      : ((refreshedRuntime?.metadata?.livePreview as
          | Record<string, unknown>
          | undefined) ?? null),
    fallback: runtimeFallback(fallbackRuntime)
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await authorizeProject(request, id)
  if (!access.ok) return access.response

  const body = (await request.json().catch(() => null)) as {
    runtimeId?: unknown
    status?: unknown
    logs?: unknown
    health?: unknown
    metadata?: unknown
  } | null
  const latest = await getLatestBrokCodeRuntimeSandbox({
    projectId: access.project.id,
    workspaceId: access.authResult.workspace.id,
    userId: access.authResult.apiKey.userId
  })
  const runtimeId =
    typeof body?.runtimeId === 'string' && body.runtimeId.trim()
      ? body.runtimeId.trim()
      : latest?.id

  if (!runtimeId) {
    return NextResponse.json(
      { error: 'No runtime sandbox exists for this project.' },
      { status: 404 }
    )
  }

  const runtime = await updateBrokCodeRuntimeSandbox({
    id: runtimeId,
    workspaceId: access.authResult.workspace.id,
    userId: access.authResult.apiKey.userId,
    status:
      typeof body?.status === 'string'
        ? (body.status as BrokCodeRuntimeStatus)
        : undefined,
    logs: Array.isArray(body?.logs)
      ? (body.logs as Array<Record<string, unknown>>)
      : undefined,
    health:
      body?.health && typeof body.health === 'object'
        ? (body.health as BrokCodeRuntimeHealth)
        : undefined,
    metadata:
      body?.metadata && typeof body.metadata === 'object'
        ? (body.metadata as Record<string, unknown>)
        : undefined
  })

  if (!runtime) {
    return NextResponse.json(
      { error: 'Runtime sandbox not found.' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    runtime,
    fallback: runtimeFallback(runtime)
  })
}
