import { NextResponse } from 'next/server'

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const specPath = join(
    process.cwd(),
    'docs',
    'openapi',
    'brok-v1.openapi.json'
  )
  const spec = JSON.parse(await readFile(specPath, 'utf8'))

  return NextResponse.json(spec, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Disposition': 'inline; filename="brok-v1.openapi.json"'
    }
  })
}
