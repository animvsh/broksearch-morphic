import { NextResponse } from 'next/server'

import {
  enforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'
import {
  createInsForgeBackendMetadata,
  decryptInsForgeAdminKey,
  emptyBrokCodeBackendMetadata,
  publicBrokCodeBackendMetadata
} from '@/lib/brokcode/backend-provider'
import { checkInsForgeProjectHealth } from '@/lib/brokcode/insforge'
import {
  getBrokCodeProject,
  getBrokCodeProjectBackend,
  updateBrokCodeProjectBackend
} from '@/lib/brokcode/project-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function publicProject<T extends { metadata?: Record<string, unknown> | null }>(
  project: T | null
) {
  if (!project) return null

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

  const backend = getBrokCodeProjectBackend(access.project)
  if (backend.provider !== 'insforge' || !backend.projectUrl) {
    const nextBackend = emptyBrokCodeBackendMetadata()
    const project = await updateBrokCodeProjectBackend({
      projectId: access.project.id,
      workspaceId: access.authResult.workspace.id,
      userId: access.authResult.apiKey.userId,
      backend: nextBackend
    })
    return NextResponse.json({
      project: publicProject(project),
      backend: publicBrokCodeBackendMetadata(nextBackend)
    })
  }

  const checkedAt = new Date().toISOString()
  const result = await checkInsForgeProjectHealth({
    projectUrl: backend.projectUrl,
    adminKey: decryptInsForgeAdminKey(backend)
  })
  const nextStatus =
    result.health === 'online'
      ? 'ready'
      : result.health === 'expired_or_limited'
        ? 'expired'
        : result.health === 'error' ||
            result.health === 'auth_error' ||
            result.health === 'not_found'
          ? 'error'
          : backend.status

  const nextBackend = createInsForgeBackendMetadata({
    ...backend,
    existingEncryptedAdminKey: backend.encryptedAdminKey,
    status: nextStatus,
    health: result.health,
    lastHealthStatus: result.statusCode,
    lastHealthCheckedAt: checkedAt,
    error: result.error
  })
  const project = await updateBrokCodeProjectBackend({
    projectId: access.project.id,
    workspaceId: access.authResult.workspace.id,
    userId: access.authResult.apiKey.userId,
    backend: nextBackend
  })

  return NextResponse.json({
    project: publicProject(project),
    backend: publicBrokCodeBackendMetadata(nextBackend)
  })
}
