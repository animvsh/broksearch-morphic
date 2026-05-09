import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function fetchFromSupabase(table: string, params: Record<string, string> = {}) {
  const searchParams = new URLSearchParams(params)
  const url = `${SUPABASE_URL}/rest/v1/${table}?${searchParams.toString()}`
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'apikey': SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json'
    }
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Supabase error: ${text}`)
  }
  return response.json()
}

async function getCount(table: string): Promise<number> {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=id`,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY,
          'Range': '0-0'
        }
      }
    )
    if (!response.ok) return 0
    const contentRange = response.headers.get('Content-Range')
    if (!contentRange) return 0
    return parseInt(contentRange.split('/')[1]) || 0
  } catch {
    return 0
  }
}

// GET /api/admin/presentations/stats
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

  try {
    if (type === 'stats') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayStr = today.toISOString()

      const [presentationsToday, slidesGeneratedToday, exportsToday, totalCost] =
        await Promise.all([
          getCount(
            `presentations?created_at=gte.${todayStr}&select=id`
          ),
          getCount(
            `presentation_slides?created_at=gte.${todayStr}&select=id`
          ),
          getCount(
            `presentation_exports?created_at=gte.${todayStr}&select=id`
          ),
          fetchFromSupabase(
            'presentation_generations?select=cost_usd'
          ).then((rows: { cost_usd: number }[]) =>
            rows.reduce((sum, r) => sum + r.cost_usd, 0) / 100
          )
        ])

      return NextResponse.json({
        presentationsToday,
        slidesGeneratedToday,
        exportsToday,
        generationCost: totalCost.toFixed(2)
      })
    }

    if (type === 'decks') {
      const page = parseInt(searchParams.get('page') || '1')
      const limit = parseInt(searchParams.get('limit') || '20')
      const offset = (page - 1) * limit
      const search = searchParams.get('search') || ''
      const status = searchParams.get('status') || ''

      let query = `presentations?select=*&order=created_at.desc&offset=${offset}&limit=${limit}`
      if (search) {
        query += `&title=ilike.*${search}*`
      }
      if (status) {
        query += `&status=eq.${status}`
      }

      const [decks, total] = await Promise.all([
        fetchFromSupabase(query),
        getCount('presentations')
      ])

      return NextResponse.json({ decks, total, page, limit })
    }

    if (type === 'generations') {
      const page = parseInt(searchParams.get('page') || '1')
      const limit = parseInt(searchParams.get('limit') || '20')
      const offset = (page - 1) * limit

      const [generations, total] = await Promise.all([
        fetchFromSupabase(
          `presentation_generations?select=*&order=created_at.desc&offset=${offset}&limit=${limit}`
        ),
        getCount('presentation_generations')
      ])

      return NextResponse.json({ generations, total, page, limit })
    }

    if (type === 'costs') {
      const generations = await fetchFromSupabase(
        'presentation_generations?select=cost_usd,generation_type,created_at'
      )

      const textGen = generations
        .filter((g: { generation_type: string }) => g.generation_type === 'outline' || g.generation_type === 'edit')
        .reduce((sum: number, g: { cost_usd: number }) => sum + g.cost_usd, 0) / 100

      const imageGen = generations
        .filter((g: { generation_type: string }) => g.generation_type === 'slides')
        .reduce((sum: number, g: { cost_usd: number }) => sum + g.cost_usd, 0) / 100

      const webSearch = generations
        .filter((g: { web_search_enabled?: boolean }) => g.web_search_enabled)
        .reduce((sum: number, g: { cost_usd: number }) => sum + g.cost_usd, 0) / 100

      const storage = 0.5

      return NextResponse.json({
        textGeneration: textGen,
        imageGeneration: imageGen,
        webSearch,
        storage
      })
    }

    if (type === 'flagged') {
      const presentations = await fetchFromSupabase(
        'presentations?select=*&order=created_at.desc&limit=100'
      )

      const flagged: typeof presentations = []

      for (const p of presentations) {
        const generations = await fetchFromSupabase(
          `presentation_generations?presentation_id=eq.${p.id}&select=id,created_at`
        )
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const todayGens = generations.filter(
          (g: { created_at: string }) => new Date(g.created_at) >= today
        )

        let reason: string | null = null
        if (todayGens.length > 50) {
          reason = `Too many generations (${todayGens.length} today)`
        } else if ((p.slide_count || 0) > 100) {
          reason = `Huge deck (${p.slide_count} slides)`
        }

        if (reason) {
          flagged.push({ ...p, reason })
        }
      }

      return NextResponse.json({ flagged })
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  } catch (error) {
    console.error('Admin presentations API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
