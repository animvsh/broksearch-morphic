import { eq } from 'drizzle-orm'
import { chromium } from 'playwright'

import { ensureWorkspaceForUser } from '../lib/actions/api-keys'
import { generateApiKey, getKeyPrefix, hashApiKey } from '../lib/api-key'
import { db } from '../lib/db'
import { apiKeys, usageEvents } from '../lib/db/schema'

import {
  createApiKeyViaSupabaseRest,
  createUsageEventViaSupabaseRest,
  ensureWorkspaceForUserViaSupabaseRest,
  updateApiKeyStatusViaSupabaseRest
} from './supabase-rest-seed'

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001'
const stressUserId =
  process.env.ANONYMOUS_USER_ID || '00000000-0000-0000-0000-000000000000'
let useSupabaseRestSeed = false

async function expectJson(
  response: Response,
  expectedStatus: number
): Promise<any> {
  const body = await response.json().catch(() => null)

  if (response.status !== expectedStatus) {
    throw new Error(
      `expected ${expectedStatus}, got ${response.status}: ${JSON.stringify(body)}`
    )
  }

  return body
}

async function createStressKeys() {
  if (process.env.SMOKE_SEED_TOKEN) {
    const response = await fetch(`${baseUrl}/api/admin/brok/smoke-seed`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SMOKE_SEED_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        kind: 'stress',
        userId: stressUserId
      })
    })
    const body = await response.json().catch(() => null)

    if (response.ok && typeof body?.mainKey === 'string') {
      return {
        workspaceId: body.workspaceId as string,
        mainKey: body.mainKey as string,
        lowRpmKey: body.lowRpmKey as string,
        dailyLimitedKey: body.dailyLimitedKey as string,
        pausedKey: body.pausedKey as string,
        revokedKey: body.revokedKey as string
      }
    }

    console.warn(
      `stress seed endpoint unavailable (${response.status}); falling back to local seeding`
    )
  }

  try {
    return await createStressKeysWithDrizzle()
  } catch (error) {
    console.warn(
      `stress DB seed unavailable, using Supabase REST fallback: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    useSupabaseRestSeed = true
    return createStressKeysWithSupabaseRest()
  }
}

async function createStressKeysWithDrizzle() {
  const workspace = await ensureWorkspaceForUser(stressUserId)

  const mainKey = await createStressKey(workspace.id, {
    name: 'Stress Main Key',
    environment: 'test',
    scopes: ['chat:write', 'search:write', 'code:write', 'usage:read'],
    allowedModels: [],
    rpmLimit: 5,
    dailyRequestLimit: 5000,
    monthlyBudgetCents: 0
  })

  const lowRpmKey = await createStressKey(workspace.id, {
    name: 'Stress Low RPM Key',
    environment: 'test',
    scopes: ['chat:write', 'usage:read'],
    allowedModels: ['brok-lite'],
    rpmLimit: 1,
    dailyRequestLimit: 5000,
    monthlyBudgetCents: 0
  })

  const dailyLimitedKey = await createStressKey(workspace.id, {
    name: 'Stress Daily Limited Key',
    environment: 'test',
    scopes: ['chat:write'],
    allowedModels: ['brok-lite'],
    rpmLimit: 5,
    dailyRequestLimit: 1,
    monthlyBudgetCents: 0
  })
  await db.insert(usageEvents).values({
    requestId: `stress_daily_${Date.now()}`,
    workspaceId: workspace.id,
    userId: stressUserId,
    apiKeyId: dailyLimitedKey.id,
    endpoint: 'chat',
    model: 'brok-lite',
    provider: 'Brok',
    inputTokens: 1,
    outputTokens: 1,
    providerCostUsd: '0',
    billedUsd: '0',
    latencyMs: 1,
    status: 'success'
  })

  const pausedKey = await createStressKey(workspace.id, {
    name: 'Stress Paused Key',
    environment: 'test',
    scopes: ['chat:write'],
    allowedModels: ['brok-lite'],
    rpmLimit: 5,
    dailyRequestLimit: 5000,
    monthlyBudgetCents: 0
  })
  await db
    .update(apiKeys)
    .set({ status: 'paused' })
    .where(eq(apiKeys.id, pausedKey.id))

  const revokedKey = await createStressKey(workspace.id, {
    name: 'Stress Revoked Key',
    environment: 'test',
    scopes: ['chat:write'],
    allowedModels: ['brok-lite'],
    rpmLimit: 5,
    dailyRequestLimit: 5000,
    monthlyBudgetCents: 0
  })
  await db
    .update(apiKeys)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(eq(apiKeys.id, revokedKey.id))

  return {
    workspaceId: workspace.id,
    mainKey: mainKey.key,
    lowRpmKey: lowRpmKey.key,
    dailyLimitedKey: dailyLimitedKey.key,
    pausedKey: pausedKey.key,
    revokedKey: revokedKey.key
  }
}

async function createStressKeysWithSupabaseRest() {
  const workspace = await ensureWorkspaceForUserViaSupabaseRest(stressUserId)

  const mainKey = await createStressKeyViaSupabaseRest(workspace.id, {
    name: 'Stress Main Key',
    environment: 'test',
    scopes: ['chat:write', 'search:write', 'code:write', 'usage:read'],
    allowedModels: [],
    rpmLimit: 5,
    dailyRequestLimit: 5000,
    monthlyBudgetCents: 0
  })

  const lowRpmKey = await createStressKeyViaSupabaseRest(workspace.id, {
    name: 'Stress Low RPM Key',
    environment: 'test',
    scopes: ['chat:write', 'usage:read'],
    allowedModels: ['brok-lite'],
    rpmLimit: 1,
    dailyRequestLimit: 5000,
    monthlyBudgetCents: 0
  })

  const dailyLimitedKey = await createStressKeyViaSupabaseRest(workspace.id, {
    name: 'Stress Daily Limited Key',
    environment: 'test',
    scopes: ['chat:write'],
    allowedModels: ['brok-lite'],
    rpmLimit: 5,
    dailyRequestLimit: 1,
    monthlyBudgetCents: 0
  })
  await createUsageEventViaSupabaseRest({
    request_id: `stress_daily_${Date.now()}`,
    workspace_id: workspace.id,
    user_id: stressUserId,
    api_key_id: dailyLimitedKey.id,
    endpoint: 'chat',
    model: 'brok-lite',
    provider: 'Brok',
    input_tokens: 1,
    output_tokens: 1,
    provider_cost_usd: '0',
    billed_usd: '0',
    latency_ms: 1,
    status: 'success'
  })

  const pausedKey = await createStressKeyViaSupabaseRest(workspace.id, {
    name: 'Stress Paused Key',
    environment: 'test',
    scopes: ['chat:write'],
    allowedModels: ['brok-lite'],
    rpmLimit: 5,
    dailyRequestLimit: 5000,
    monthlyBudgetCents: 0
  })
  await updateApiKeyStatusViaSupabaseRest(pausedKey.id, 'paused')

  const revokedKey = await createStressKeyViaSupabaseRest(workspace.id, {
    name: 'Stress Revoked Key',
    environment: 'test',
    scopes: ['chat:write'],
    allowedModels: ['brok-lite'],
    rpmLimit: 5,
    dailyRequestLimit: 5000,
    monthlyBudgetCents: 0
  })
  await updateApiKeyStatusViaSupabaseRest(revokedKey.id, 'revoked')

  return {
    workspaceId: workspace.id,
    mainKey: mainKey.key,
    lowRpmKey: lowRpmKey.key,
    dailyLimitedKey: dailyLimitedKey.key,
    pausedKey: pausedKey.key,
    revokedKey: revokedKey.key
  }
}

async function createStressKeyViaSupabaseRest(
  workspaceId: string,
  input: {
    name: string
    environment: 'test' | 'live'
    scopes: string[]
    allowedModels: string[]
    rpmLimit: number
    dailyRequestLimit: number
    monthlyBudgetCents: number
  }
) {
  const rawKey = generateApiKey(input.environment)
  const created = await createApiKeyViaSupabaseRest({
    workspace_id: workspaceId,
    user_id: stressUserId,
    name: input.name,
    key_prefix: getKeyPrefix(rawKey),
    key_hash: hashApiKey(rawKey),
    environment: input.environment,
    scopes: input.scopes,
    allowed_models: input.allowedModels,
    rpm_limit: input.rpmLimit,
    daily_request_limit: input.dailyRequestLimit,
    monthly_budget_cents: input.monthlyBudgetCents
  })

  return { ...created, key: rawKey }
}

async function createStressKey(
  workspaceId: string,
  input: {
    name: string
    environment: 'test' | 'live'
    scopes: string[]
    allowedModels: string[]
    rpmLimit: number
    dailyRequestLimit: number
    monthlyBudgetCents: number
  }
) {
  const rawKey = generateApiKey(input.environment)
  const [created] = await db
    .insert(apiKeys)
    .values({
      workspaceId,
      userId: stressUserId,
      name: input.name,
      keyPrefix: getKeyPrefix(rawKey),
      keyHash: hashApiKey(rawKey),
      environment: input.environment,
      scopes: input.scopes,
      allowedModels: input.allowedModels,
      rpmLimit: input.rpmLimit,
      dailyRequestLimit: input.dailyRequestLimit,
      monthlyBudgetCents: input.monthlyBudgetCents
    })
    .returning()

  return { ...created, key: rawKey }
}

async function runChat(baseKey: string, label: string) {
  const response = await fetch(`${baseUrl}/api/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${baseKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'brok-lite',
      stream: false,
      max_tokens: 64,
      messages: [{ role: 'user', content: `Reply with one sentence: ${label}` }]
    })
  })

  const body = await expectJson(response, 200)

  if (!Array.isArray(body.choices) || body.choices.length === 0) {
    throw new Error('chat response missing choices')
  }
}

async function runSearch(baseKey: string) {
  const response = await fetch(`${baseUrl}/api/v1/search/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${baseKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'brok-lite',
      search_depth: 'basic',
      stream: false,
      query: 'What does capy.ad do? Answer briefly.'
    })
  })

  const body = await expectJson(response, 200)

  if (!Array.isArray(body.citations)) {
    throw new Error('search response missing citations array')
  }

  if (body.model !== 'brok-lite') {
    throw new Error('search response did not use brok-lite')
  }

  const searchQueries = Array.isArray(body.search_queries)
    ? body.search_queries
    : []
  if (!searchQueries.some((query: string) => query.includes('site:capy.ad'))) {
    throw new Error('search response did not keep explicit capy.ad domain')
  }
}

async function runBrokCode(baseKey: string) {
  const response = await fetch(`${baseUrl}/api/brokcode/execute`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${baseKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      command: '/securityscan status',
      model: 'brok-code',
      stream: false
    })
  })

  const body = await expectJson(response, 200)

  if (body?.security_scan?.provider !== 'deepsec') {
    throw new Error('brokcode security scan response missing DeepSec payload')
  }
}

async function runApiStress(
  keys: Awaited<ReturnType<typeof createStressKeys>>
) {
  await runChat(keys.mainKey, 'stress-main')
  console.log('stress api ok chat success')

  await runSearch(keys.mainKey)
  console.log('stress api ok search success')

  await runBrokCode(keys.mainKey)
  console.log('stress api ok brokcode execution success')

  const usageResponse = await fetch(`${baseUrl}/api/v1/usage`, {
    headers: {
      Authorization: `Bearer ${keys.mainKey}`
    }
  })
  const usageBody = await expectJson(usageResponse, 200)
  if ((usageBody?.usage?.requests ?? 0) < 3) {
    throw new Error('usage endpoint did not reflect successful API activity')
  }
  console.log('stress api ok usage aggregation')

  const pausedResponse = await fetch(`${baseUrl}/api/v1/usage`, {
    headers: {
      Authorization: `Bearer ${keys.pausedKey}`
    }
  })
  const pausedBody = await expectJson(pausedResponse, 403)
  if (pausedBody?.error?.code !== 'inactive_key') {
    throw new Error('paused key did not return inactive_key')
  }
  console.log('stress api ok paused key rejection')

  const revokedResponse = await fetch(`${baseUrl}/api/v1/usage`, {
    headers: {
      Authorization: `Bearer ${keys.revokedKey}`
    }
  })
  const revokedBody = await expectJson(revokedResponse, 403)
  if (revokedBody?.error?.code !== 'inactive_key') {
    throw new Error('revoked key did not return inactive_key')
  }
  console.log('stress api ok revoked key rejection')

  const missingScopeResponse = await fetch(
    `${baseUrl}/api/v1/search/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${keys.lowRpmKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'brok-search',
        stream: false,
        query: 'scope check'
      })
    }
  )
  const missingScopeBody = await expectJson(missingScopeResponse, 403)
  if (missingScopeBody?.error?.code !== 'missing_scope') {
    throw new Error('search without search:write did not return missing_scope')
  }
  console.log('stress api ok scope enforcement')

  const dailyLimitedResponse = await fetch(
    `${baseUrl}/api/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${keys.dailyLimitedKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'brok-lite',
        stream: false,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'daily limit check' }]
      })
    }
  )
  const dailyLimitedBody = await expectJson(dailyLimitedResponse, 429)
  if (dailyLimitedBody?.error?.code !== 'daily_request_limit_exceeded') {
    throw new Error(
      'daily-limited key did not return daily_request_limit_exceeded'
    )
  }
  console.log('stress api ok daily usage limit enforcement')

  await runChat(keys.lowRpmKey, 'rate-limit-first')

  const rateLimitedResponse = await fetch(
    `${baseUrl}/api/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${keys.lowRpmKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'brok-lite',
        stream: false,
        max_tokens: 32,
        messages: [{ role: 'user', content: 'rate-limit-second' }]
      })
    }
  )
  const rateLimitedBody = await expectJson(rateLimitedResponse, 429)
  if (rateLimitedBody?.error?.code !== 'rate_limit_exceeded') {
    throw new Error('low-rpm key did not hit rate_limit_exceeded')
  }
  console.log('stress api ok rate limit enforcement')
}

async function runBrowserChecks() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const pageErrors: string[] = []

  page.on('pageerror', error => {
    pageErrors.push(error.message)
  })

  try {
    const protectedChecks = [
      '/admin/brok',
      '/admin/brok/logs',
      '/admin/brok/providers'
    ]

    for (const path of protectedChecks) {
      pageErrors.length = 0
      await page.goto(`${baseUrl}${path}`, {
        waitUntil: 'networkidle'
      })

      if (!page.url().includes('/auth/login')) {
        throw new Error(`${path} should redirect to login when unauthenticated`)
      }
      if (!page.url().includes('redirectTo=')) {
        throw new Error(`${path} login redirect missing redirectTo`)
      }
      if (pageErrors.length > 0) {
        throw new Error(`${path} page errors: ${pageErrors.join('; ')}`)
      }

      console.log(`stress ui protected ok ${path}`)
    }
  } finally {
    await browser.close()
  }
}

async function main() {
  console.log(`stress base ${baseUrl}`)
  const keys = await createStressKeys()
  console.log(`stress workspace ${keys.workspaceId}`)

  await runApiStress(keys)
  await runBrowserChecks()

  console.log('stress ok')
  process.exit(0)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
