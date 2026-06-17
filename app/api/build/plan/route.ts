import { NextResponse } from 'next/server'

import { generateBrokBuildPlan } from '@/lib/actions/build'
import { requireFeatureAccessForApi } from '@/lib/auth/app-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let body: { prompt?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400 }
    )
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt) {
    return NextResponse.json(
      { error: 'A non-empty prompt is required.' },
      { status: 400 }
    )
  }
  if (prompt.length > 4000) {
    return NextResponse.json(
      { error: 'Prompt is too long (max 4000 chars).' },
      { status: 400 }
    )
  }

  const access = await requireFeatureAccessForApi('brokcode')
  if (!access.ok) return access.response

  const result = await generateBrokBuildPlan({ prompt })
  return NextResponse.json(result)
}
