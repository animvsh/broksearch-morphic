import { NextResponse } from 'next/server'

import {
  enforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'
import {
  createInsForgeBackendMetadata,
  emptyBrokCodeBackendMetadata,
  publicBrokCodeBackendMetadata
} from '@/lib/brokcode/backend-provider'
import {
  getBrokCodeProject,
  getBrokCodeProjectBackend,
  updateBrokCodeProjectBackend
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await authorizeProject(request, id)
  if (!access.ok) return access.response

  return NextResponse.json({
    project: publicProject(access.project),
    backend: publicBrokCodeBackendMetadata(
      getBrokCodeProjectBackend(access.project)
    )
  })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await authorizeProject(request, id)
  if (!access.ok) return access.response

  const body = (await request.json().catch(() => null)) as {
    backend?: unknown
    provider?: unknown
  } | null
  const backendBody =
    body?.backend && typeof body.backend === 'object'
      ? (body.backend as Record<string, unknown>)
      : ((body ?? {}) as Record<string, unknown>)
  const provider = backendBody.provider ?? body?.provider
  const existingBackend = getBrokCodeProjectBackend(access.project)
  const backend =
    provider === 'insforge'
      ? createInsForgeBackendMetadata({
          ...backendBody,
          existingEncryptedAdminKey:
            existingBackend.provider === 'insforge'
              ? existingBackend.encryptedAdminKey
              : undefined
        })
      : emptyBrokCodeBackendMetadata()

  const project = await updateBrokCodeProjectBackend({
    projectId: access.project.id,
    workspaceId: access.authResult.workspace.id,
    userId: access.authResult.apiKey.userId,
    backend
  })

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  return NextResponse.json({
    project: publicProject(project),
    backend: publicBrokCodeBackendMetadata(project.metadata?.backend)
  })
}
