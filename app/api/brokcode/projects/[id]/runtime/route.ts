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
  BrokCodeRuntimeHealth,
  BrokCodeRuntimeStatus,
  createBrokCodeRuntimeSpec
} from '@/lib/brokcode/runtime/contract'
import {
  createBrokCodeRuntimeSandbox,
  getLatestBrokCodeRuntimeSandbox,
  listBrokCodeRuntimeSandboxes,
  updateBrokCodeRuntimeSandbox
} from '@/lib/brokcode/runtime/store'

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

function runtimeFallback() {
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
    fallback: runtimeFallback()
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
      ? latest
      : await createBrokCodeRuntimeSandbox({
          spec
        })

  return NextResponse.json({
    runtime,
    spec,
    fallback: runtimeFallback()
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
    fallback: runtimeFallback()
  })
}
