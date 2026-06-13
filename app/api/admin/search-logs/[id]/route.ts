import { NextResponse } from 'next/server'

import { getSearchLogDetailForAdmin } from '@/lib/actions/admin-search-projects-logs-data'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const detail = await getSearchLogDetailForAdmin(id)
    if (!detail) {
      return NextResponse.json({ error: 'Log not found' }, { status: 404 })
    }
    return NextResponse.json(detail)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to load search log'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
