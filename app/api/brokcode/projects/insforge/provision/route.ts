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
import { createInsForgeTrialProject } from '@/lib/brokcode/insforge'
import {
  createBrokCodeProject,
  getBrokCodeProject,
  updateBrokCodeProjectBackend
} from '@/lib/brokcode/project-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getProvisionWaitMs() {
  const configured = Number.parseInt(
    process.env.BROKCODE_INSFORGE_PROVISION_WAIT_MS || '',
    10
  )
  if (Number.isFinite(configured) && configured >= 0) {
    return Math.min(configured, 25_000)
  }
  return 10_000
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function pollInsForgeHealth(projectUrl: string) {
  const startedAt = Date.now()
  const waitMs = getProvisionWaitMs()
  const deadline = startedAt + waitMs
  let lastStatus: number | null = null
  let lastError: string | null = null

  do {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8000)
      const response = await fetch(projectUrl, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store'
      })
      clearTimeout(timer)
      lastStatus = response.status

      if (response.status !== 503) {
        return {
          health:
            response.status >= 200 && response.status < 500
              ? ('online' as const)
              : ('offline' as const),
          statusCode: response.status,
          error: null
        }
      }
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : 'InsForge health check failed.'
    }

    if (waitMs === 0 || Date.now() >= deadline) break
    await sleep(Math.min(3000, Math.max(0, deadline - Date.now())))
  } while (Date.now() < deadline)

  return {
    health: 'offline' as const,
    statusCode: lastStatus,
    error:
      lastError ??
      'InsForge project is still warming up. Use the backend health check to refresh status.'
  }
}

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

export async function POST(request: Request) {
  const { authResult } = await resolveBrokCodeRequestAuth(request, {
    allowBrowserSession: true
  })
  if (!authResult.success) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    )
  }

  const accountMismatch = await enforceBrokCodeAccountOwnership(authResult)
  if (accountMismatch) return accountMismatch

  const body = (await request.json().catch(() => null)) as {
    project_id?: unknown
    projectName?: unknown
  } | null
  const projectName =
    typeof body?.projectName === 'string' && body.projectName.trim()
      ? body.projectName.trim()
      : 'BrokCode app'
  const projectId =
    typeof body?.project_id === 'string' && body.project_id.trim()
      ? body.project_id.trim()
      : null

  let project = projectId
    ? await getBrokCodeProject({
        id: projectId,
        workspaceId: authResult.workspace.id,
        userId: authResult.apiKey.userId
      })
    : null

  if (projectId && !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  if (!project) {
    project = await createBrokCodeProject({
      workspaceId: authResult.workspace.id,
      userId: authResult.apiKey.userId,
      name: projectName,
      backend: emptyBrokCodeBackendMetadata()
    })
  }

  try {
    await updateBrokCodeProjectBackend({
      projectId: project.id,
      workspaceId: authResult.workspace.id,
      userId: authResult.apiKey.userId,
      backend: createInsForgeBackendMetadata({
        mode: 'trial',
        status: 'provisioning'
      })
    })

    const trial = await createInsForgeTrialProject(projectName)
    const health = await pollInsForgeHealth(trial.projectUrl)
    const backend = createInsForgeBackendMetadata({
      mode: 'trial',
      status: health.health === 'online' ? 'ready' : 'provisioning',
      projectUrl: trial.projectUrl,
      dashboardUrl: trial.dashboardUrl,
      claimUrl: trial.claimUrl,
      projectId: trial.projectId,
      appkey: trial.appkey,
      region: trial.region,
      trialExpiresAt: trial.trialExpiresAt,
      adminKey: trial.accessApiKey,
      health: health.health,
      lastHealthStatus: health.statusCode,
      lastHealthCheckedAt: new Date().toISOString(),
      error: health.error
    })

    const updatedProject = await updateBrokCodeProjectBackend({
      projectId: project.id,
      workspaceId: authResult.workspace.id,
      userId: authResult.apiKey.userId,
      backend
    })

    return NextResponse.json({
      project: publicProject(updatedProject),
      backend: publicBrokCodeBackendMetadata(backend)
    })
  } catch (error) {
    const backend = createInsForgeBackendMetadata({
      mode: 'trial',
      status: 'error',
      health: 'error',
      error:
        error instanceof Error
          ? error.message
          : 'InsForge trial provisioning failed.'
    })
    const updatedProject = await updateBrokCodeProjectBackend({
      projectId: project.id,
      workspaceId: authResult.workspace.id,
      userId: authResult.apiKey.userId,
      backend
    })

    return NextResponse.json(
      {
        project: publicProject(updatedProject),
        backend: publicBrokCodeBackendMetadata(backend),
        error: backend.error
      },
      { status: 502 }
    )
  }
}
