import { NextResponse } from 'next/server'

import {
  enforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'
import { publicBrokCodeBackendMetadata } from '@/lib/brokcode/backend-provider'
import {
  applyBrokCodeFileOperations,
  BrokCodeFileOperation,
  BrokCodeFileOperationError
} from '@/lib/brokcode/file-operations'
import {
  type GeneratedBrokCodeFile,
  prepareGeneratedBrokCodeFiles
} from '@/lib/brokcode/generated-files'
import {
  deleteBrokCodeProjectFile,
  getBrokCodeProject,
  listBrokCodeProjectFiles,
  renameBrokCodeProjectFile,
  upsertBrokCodeProjectFile
} from '@/lib/brokcode/project-store'
import { createBrokCodeRuntimeSpec } from '@/lib/brokcode/runtime/contract'
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

  const preparedFiles = prepareGeneratedBrokCodeFiles(
    [
      {
        path,
        content,
        language
      } satisfies GeneratedBrokCodeFile
    ],
    { fallbackTitle: access.project.name }
  )

  const savedFiles = []
  try {
    for (const preparedFile of preparedFiles) {
      savedFiles.push(
        await upsertBrokCodeProjectFile({
          projectId: access.project.id,
          workspaceId: access.authResult.workspace.id,
          path: preparedFile.path,
          content: preparedFile.content,
          language: preparedFile.language
        })
      )
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid file path') {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })
    }
    throw error
  }

  const allFiles = await listBrokCodeProjectFiles({
    projectId: access.project.id,
    workspaceId: access.authResult.workspace.id
  })
  const spec = createBrokCodeRuntimeSpec({
    projectId: access.project.id,
    workspaceId: access.authResult.workspace.id,
    userId: access.authResult.apiKey.userId,
    files: allFiles
  })

  try {
    const runtimeWorkspace = await materializeBrokCodeRuntimeWorkspace({
      spec,
      files: allFiles,
      projectName: access.project.name
    })
    return NextResponse.json({
      file: savedFiles[0] ?? null,
      files: savedFiles,
      runtimeWorkspace: runtimeWorkspace.manifest
    })
  } catch (error) {
    if (error instanceof BrokCodeRuntimeWorkspaceError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    throw error
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await authorizeProject(request, id)
  if (!access.ok) return access.response

  const body = (await request.json().catch(() => null)) as {
    operations?: unknown
    conflictResolution?: unknown
  } | null
  const operations = Array.isArray(body?.operations)
    ? (body.operations as BrokCodeFileOperation[])
    : []
  const applyAnyway = body?.conflictResolution === 'apply_anyway'
  if (operations.length === 0) {
    return NextResponse.json(
      { error: 'At least one file operation is required.' },
      { status: 400 }
    )
  }

  const currentFiles = await listBrokCodeProjectFiles({
    projectId: access.project.id,
    workspaceId: access.authResult.workspace.id
  })

  let applied: ReturnType<typeof applyBrokCodeFileOperations>
  try {
    applied = applyBrokCodeFileOperations({
      files: currentFiles,
      operations,
      applyAnyway
    })
  } catch (error) {
    if (error instanceof BrokCodeFileOperationError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          conflicts: error.conflicts,
          resolutionChoices: [
            'apply_anyway',
            'review_diff',
            'retry_latest_context'
          ]
        },
        { status: error.code === 'conflict' ? 409 : 400 }
      )
    }
    throw error
  }

  const byPath = new Map(applied.files.map(file => [file.path, file]))
  for (const change of applied.changes) {
    if (change.type === 'delete_file') {
      await deleteBrokCodeProjectFile({
        projectId: access.project.id,
        workspaceId: access.authResult.workspace.id,
        path: change.path
      })
      continue
    }

    if (change.type === 'rename_file' && change.toPath) {
      await renameBrokCodeProjectFile({
        projectId: access.project.id,
        workspaceId: access.authResult.workspace.id,
        fromPath: change.path,
        toPath: change.toPath
      })
      continue
    }

    const file = byPath.get(change.path)
    if (!file) continue
    await upsertBrokCodeProjectFile({
      projectId: access.project.id,
      workspaceId: access.authResult.workspace.id,
      path: file.path,
      content: file.content,
      language: file.language
    })
  }

  const allFiles = await listBrokCodeProjectFiles({
    projectId: access.project.id,
    workspaceId: access.authResult.workspace.id
  })

  return NextResponse.json({
    changes: applied.changes,
    files: allFiles,
    resolutionChoices: ['review_diff', 'retry_latest_context']
  })
}
