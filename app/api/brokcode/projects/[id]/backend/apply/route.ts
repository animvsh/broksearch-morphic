import { NextResponse } from 'next/server'

import {
  enforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'
import {
  decryptInsForgeAdminKey,
  publicBrokCodeBackendMetadata
} from '@/lib/brokcode/backend-provider'
import { applyInsForgeBackendResourcePlan } from '@/lib/brokcode/insforge-backend-apply'
import {
  getBrokCodeProject,
  getBrokCodeProjectBackend,
  updateBrokCodeProjectMetadata
} from '@/lib/brokcode/project-store'
import { getPersistedBrokBuildBackendPlan } from '@/lib/build/backend-plan-metadata'

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await authorizeProject(request, id)
  if (!access.ok) return access.response

  const backendPlan = getPersistedBrokBuildBackendPlan(access.project.metadata)
  if (!backendPlan) {
    return NextResponse.json(
      { error: 'Backend plan not found for this project.' },
      { status: 404 }
    )
  }

  const backend = getBrokCodeProjectBackend(access.project)
  if (backend.provider !== 'insforge' || !backend.projectUrl) {
    return NextResponse.json(
      {
        error:
          'InsForge backend is not connected for this project. Connect or provision a backend before applying resources.',
        backend: publicBrokCodeBackendMetadata(backend)
      },
      { status: 422 }
    )
  }

  const adminKey = decryptInsForgeAdminKey(backend)
  if (!adminKey) {
    return NextResponse.json(
      {
        error:
          'InsForge admin key is not available. Reconnect the backend with a valid key.'
      },
      { status: 401 }
    )
  }

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >
  const dryRun = body.dryRun === true
  const result = await applyInsForgeBackendResourcePlan({
    projectUrl: backend.projectUrl,
    adminKey,
    plan: backendPlan,
    migrationNameSeed: access.project.name || access.project.id,
    dryRun
  })

  const preview =
    access.project.metadata?.preview &&
    typeof access.project.metadata.preview === 'object' &&
    !Array.isArray(access.project.metadata.preview)
      ? (access.project.metadata.preview as Record<string, unknown>)
      : {}

  await updateBrokCodeProjectMetadata({
    projectId: access.project.id,
    workspaceId: access.authResult.workspace.id,
    userId: access.authResult.apiKey.userId,
    metadata: {
      preview: {
        ...preview,
        backendApply: result
      }
    }
  })

  return NextResponse.json(
    {
      projectId: access.project.id,
      backend: publicBrokCodeBackendMetadata(backend),
      result
    },
    { status: result.status === 'failed' ? 502 : 200 }
  )
}
