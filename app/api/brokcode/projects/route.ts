import { NextResponse } from 'next/server'

import {
  enforceBrokCodeAccountOwnership,
  resolveBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'
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

  return NextResponse.json({ projects })
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
  } | null
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const username =
    typeof body?.username === 'string' ? body.username.trim() : null

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
    username
  })

  return NextResponse.json({ project }, { status: 201 })
}
