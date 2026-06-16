import { describe, expect, test } from 'vitest'

import { applyInsForgeBackendResourcePlan } from '../insforge-backend-apply'

const plan = {
  provider: 'insforge' as const,
  status: 'planned' as const,
  tables: [],
  storageBuckets: [
    {
      name: 'crm_uploads',
      visibility: 'private' as const,
      policies: ['owner-read-write']
    }
  ],
  functions: [
    {
      slug: 'crm_follow_up',
      purpose: 'Send a follow-up email'
    }
  ],
  publicEnv: ['NEXT_PUBLIC_INSFORGE_URL'],
  privateEnv: ['INSFORGE_API_KEY'],
  applySteps: [],
  migrationSql: 'create table if not exists public.todos (id uuid primary key);'
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

describe('applyInsForgeBackendResourcePlan', () => {
  test('applies migration, creates bucket, and creates function through InsForge project APIs', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetchImpl = (async (
      url: string | URL | Request,
      init?: RequestInit
    ) => {
      const urlText = String(url)
      calls.push({ url: urlText, init })

      if (urlText.endsWith('/api/database/migrations') && !init?.method) {
        return jsonResponse({ migrations: [{ version: '20260616010101' }] })
      }
      if (
        urlText.endsWith('/api/database/migrations') &&
        init?.method === 'POST'
      ) {
        return jsonResponse({ version: '20260617000000', name: 'brokcode-crm' })
      }
      if (urlText.endsWith('/api/storage/buckets') && !init?.method) {
        return jsonResponse({ buckets: [] })
      }
      if (urlText.endsWith('/api/storage/buckets') && init?.method === 'POST') {
        return jsonResponse({ name: 'crm_uploads' })
      }
      if (urlText.endsWith('/api/functions/crm_follow_up')) {
        return jsonResponse({ error: 'not found' }, 404)
      }
      if (urlText.endsWith('/api/functions') && init?.method === 'POST') {
        return jsonResponse({ success: true })
      }

      return jsonResponse({})
    }) as typeof fetch

    const result = await applyInsForgeBackendResourcePlan({
      projectUrl: 'https://example.insforge.app',
      adminKey: 'secret',
      plan,
      migrationNameSeed: 'CRM',
      now: new Date('2026-06-17T00:00:00Z'),
      fetchImpl
    })

    expect(result.status).toBe('applied')
    expect(result.migrationVersion).toBe('20260617000000')
    expect(result.steps.map(step => step.status)).toEqual([
      'applied',
      'applied',
      'applied'
    ])
    expect(calls.map(call => [call.init?.method ?? 'GET', call.url])).toEqual([
      ['GET', 'https://example.insforge.app/api/database/migrations'],
      ['POST', 'https://example.insforge.app/api/database/migrations'],
      ['GET', 'https://example.insforge.app/api/storage/buckets'],
      ['POST', 'https://example.insforge.app/api/storage/buckets'],
      ['GET', 'https://example.insforge.app/api/functions/crm_follow_up'],
      ['POST', 'https://example.insforge.app/api/functions']
    ])
    expect(calls[1].init?.body).toContain('"sql"')
    expect(calls[3].init?.body).toContain('"isPublic":false')
    expect(calls[5].init?.body).toContain('crm_follow_up')
  })

  test('fails closed and skips remaining steps after an InsForge API error', async () => {
    const fetchImpl = (async (
      url: string | URL | Request,
      init?: RequestInit
    ) => {
      const urlText = String(url)
      if (urlText.endsWith('/api/database/migrations') && !init?.method) {
        return jsonResponse({ migrations: [] })
      }
      return jsonResponse({ message: 'migration rejected' }, 400)
    }) as typeof fetch

    const result = await applyInsForgeBackendResourcePlan({
      projectUrl: 'https://example.insforge.app',
      adminKey: 'secret',
      plan,
      migrationNameSeed: 'CRM',
      now: new Date('2026-06-17T00:00:00Z'),
      fetchImpl
    })

    expect(result.status).toBe('failed')
    expect(result.steps[0]).toMatchObject({
      status: 'failed',
      statusCode: 400,
      message: 'migration rejected'
    })
    expect(result.steps.slice(1).every(step => step.status === 'skipped')).toBe(
      true
    )
  })
})
