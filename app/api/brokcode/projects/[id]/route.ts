import { NextResponse } from 'next/server'

import { unauthorizedResponse } from '@/lib/brok/auth'
import {
  enforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'
import { publicBrokCodeBackendMetadata } from '@/lib/brokcode/backend-provider'
import {
  deleteBrokCodeProject,
  getBrokCodeProject,
  renameBrokCodeProject
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
      response: unauthorizedResponse(authResult)
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
  return NextResponse.json({ project: publicProject(access.project) })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await authorizeProject(request, id)
  if (!access.ok) return access.response

  const body = (await request.json().catch(() => null)) as {
    name?: unknown
  } | null
  const name = typeof body?.name === 'string' ? body.name.trim() : ''

  if (!name) {
    return NextResponse.json({ error: 'name is required.' }, { status: 400 })
  }

  const updated = await renameBrokCodeProject({
    id,
    workspaceId: access.authResult.workspace.id,
    userId: access.authResult.apiKey.userId,
    name
  })
  if (!updated) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
  }
  return NextResponse.json({ project: publicProject(updated) })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await authorizeProject(request, id)
  if (!access.ok) return access.response

  const removed = await deleteBrokCodeProject({
    id,
    workspaceId: access.authResult.workspace.id,
    userId: access.authResult.apiKey.userId
  })

  if (!removed) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, id })
}
