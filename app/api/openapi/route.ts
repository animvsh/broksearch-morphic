import { NextResponse } from 'next/server'

import spec from '@/docs/openapi/brok-v1.openapi.json'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(spec, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Disposition': 'inline; filename="brok-v1.openapi.json"'
    }
  })
}
