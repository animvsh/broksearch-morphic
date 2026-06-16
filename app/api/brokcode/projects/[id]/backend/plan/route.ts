import { NextResponse } from 'next/server'

import {
  enforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'
import { getBrokCodeProject } from '@/lib/brokcode/project-store'

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

  return { ok: true as const, project }
}

function getBackendPlan(metadata: Record<string, unknown> | null | undefined) {
  const preview =
    metadata?.preview &&
    typeof metadata.preview === 'object' &&
    !Array.isArray(metadata.preview)
      ? (metadata.preview as Record<string, unknown>)
      : null
  const backendPlan = preview?.backendPlan

  if (
    !backendPlan ||
    typeof backendPlan !== 'object' ||
    Array.isArray(backendPlan)
  ) {
    return null
  }

  const plan = backendPlan as Record<string, unknown>
  if (
    plan.provider !== 'insforge' ||
    plan.status !== 'planned' ||
    typeof plan.migrationSql !== 'string'
  ) {
    return null
  }

  return plan
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await authorizeProject(request, id)
  if (!access.ok) return access.response

  const backendPlan = getBackendPlan(access.project.metadata)
  if (!backendPlan) {
    return NextResponse.json(
      { error: 'Backend plan not found for this project.' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    projectId: access.project.id,
    backendPlan
  })
}
