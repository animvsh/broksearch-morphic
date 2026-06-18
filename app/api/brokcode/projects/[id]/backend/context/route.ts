import { NextResponse } from 'next/server'

import {
  enforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'
import {
  decryptInsForgeAdminKey,
  publicBrokCodeBackendMetadata
} from '@/lib/brokcode/backend-provider'
import {
  fetchInsForgeBackendContext,
  formatInsForgeBackendContextForPrompt
} from '@/lib/brokcode/insforge'
import {
  getBrokCodeProject,
  getBrokCodeProjectBackend
} from '@/lib/brokcode/project-store'

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

function backendContextUnavailable(
  context: Awaited<ReturnType<typeof fetchInsForgeBackendContext>> | null
) {
  if (!context) return true

  const hasDatabaseMetadata =
    context.database.totalTables !== null ||
    context.database.totalRecords !== null ||
    context.database.databaseSize !== null
  const hasDiscoveredResources =
    context.database.tables.length > 0 ||
    context.storageBuckets.length > 0 ||
    context.functions.length > 0

  return (
    !hasDatabaseMetadata &&
    !hasDiscoveredResources &&
    context.errors.length >= 4
  )
}

function backendContextFailureResponse() {
  return NextResponse.json(
    {
      error:
        'InsForge backend context could not be fetched. Check backend health and admin key, then retry Backend setup.',
      code: 'insforge_context_unavailable'
    },
    { status: 502 }
  )
}

/**
 * GET /api/brokcode/projects/[id]/backend/context
 *
 * Fetches live InsForge backend context (tables, schema, buckets, functions,
 * auth config, errors) and returns it as structured data plus a formatted
 * prompt-ready string. The admin key is never included in responses.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await authorizeProject(request, id)
  if (!access.ok) return access.response

  const backend = getBrokCodeProjectBackend(access.project)
  if (backend.provider !== 'insforge' || !backend.projectUrl) {
    return NextResponse.json(
      {
        error:
          'InsForge backend is not configured for this project. Set up a backend first.'
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

  const tableLimit = 8
  let context: Awaited<ReturnType<typeof fetchInsForgeBackendContext>> | null
  try {
    context = await fetchInsForgeBackendContext({
      projectUrl: backend.projectUrl,
      adminKey,
      tableLimit
    })
  } catch (error) {
    console.error('InsForge context fetch failed:', error)
    return backendContextFailureResponse()
  }

  if (backendContextUnavailable(context)) {
    console.error('InsForge context fetch returned no usable context:', {
      projectId: id,
      errors: context?.errors ?? []
    })
    return backendContextFailureResponse()
  }

  const promptText = formatInsForgeBackendContextForPrompt(context)
  if (!promptText.trim()) {
    console.error('InsForge context prompt was empty:', { projectId: id })
    return backendContextFailureResponse()
  }

  return NextResponse.json({
    context,
    promptText,
    backend: publicBrokCodeBackendMetadata(backend),
    fetchedAt: new Date().toISOString()
  })
}
