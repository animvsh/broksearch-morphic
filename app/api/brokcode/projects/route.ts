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
  createBrokCodeProject,
  listBrokCodeProjects
} from '@/lib/brokcode/project-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
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

  const projects = await listBrokCodeProjects({
    workspaceId: authResult.workspace.id,
    userId: authResult.apiKey.userId
  })

  return NextResponse.json({
    projects: projects.map(project => ({
      ...project,
      metadata: {
        ...(project.metadata ?? {}),
        backend: publicBrokCodeBackendMetadata(project.metadata?.backend)
      }
    }))
  })
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
    name?: unknown
    username?: unknown
    backend?: unknown
    backend_provider?: unknown
  } | null
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const username =
    typeof body?.username === 'string' ? body.username.trim() : null
  const backendBody =
    body?.backend && typeof body.backend === 'object'
      ? (body.backend as Record<string, unknown>)
      : null
  const backendProvider =
    backendBody?.provider ??
    body?.backend_provider ??
    backendBody?.backendProvider
  const backend =
    backendProvider === 'insforge'
      ? createInsForgeBackendMetadata(backendBody ?? {})
      : emptyBrokCodeBackendMetadata()

  if (!name) {
    return NextResponse.json(
      { error: 'Project name is required' },
      { status: 400 }
    )
  }

  const project = await createBrokCodeProject({
    workspaceId: authResult.workspace.id,
    userId: authResult.apiKey.userId,
    name,
    username,
    backend
  })

  return NextResponse.json(
    {
      project: {
        ...project,
        metadata: {
          ...(project.metadata ?? {}),
          backend: publicBrokCodeBackendMetadata(project.metadata?.backend)
        }
      }
    },
    { status: 201 }
  )
}
