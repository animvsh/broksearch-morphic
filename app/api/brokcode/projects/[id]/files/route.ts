import { NextResponse } from 'next/server'

import {
  enforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'
import { publicBrokCodeBackendMetadata } from '@/lib/brokcode/backend-provider'
import {
  getBrokCodeProject,
  listBrokCodeProjectFiles,
  upsertBrokCodeProjectFile
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

  const files = await listBrokCodeProjectFiles({
    projectId: access.project.id,
    workspaceId: access.authResult.workspace.id
  })

  return NextResponse.json({ project: publicProject(access.project), files })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await authorizeProject(request, id)
  if (!access.ok) return access.response

  const body = (await request.json().catch(() => null)) as {
    path?: unknown
    content?: unknown
    language?: unknown
  } | null
  const path = typeof body?.path === 'string' ? body.path.trim() : ''
  const content = typeof body?.content === 'string' ? body.content : ''
  const language =
    typeof body?.language === 'string' ? body.language.trim() : null

  if (!path) {
    return NextResponse.json(
      { error: 'File path is required' },
      { status: 400 }
    )
  }

  let file
  try {
    file = await upsertBrokCodeProjectFile({
      projectId: access.project.id,
      workspaceId: access.authResult.workspace.id,
      path,
      content,
      language
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid file path') {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })
    }
    throw error
  }

  return NextResponse.json({ file })
}
