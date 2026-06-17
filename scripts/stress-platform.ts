import { eq } from 'drizzle-orm'
import type { Page } from 'playwright'
import { chromium } from 'playwright'

import { generateApiKey, getKeyPrefix, hashNewApiKey } from '../lib/api-key'

import {
  createApiKeyViaSupabaseRest,
  createUsageEventViaSupabaseRest,
  ensureWorkspaceForUserViaSupabaseRest,
  updateApiKeyStatusViaSupabaseRest,
  updateWorkspaceMonthlyBudgetViaSupabaseRest
} from './supabase-rest-seed'

const seedMonthlyBudgetCents = 100

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001'
const stressUserId =
  process.env.ANONYMOUS_USER_ID || '00000000-0000-0000-0000-000000000000'
const browserNavigationTimeoutMs = readPositiveIntegerEnv(
  'STRESS_PLATFORM_BROWSER_TIMEOUT_MS',
  120_000
)
const contractsOnly = process.env.STRESS_PLATFORM_CONTRACTS_ONLY === 'true'
let useSupabaseRestSeed = false

type RouteContract = {
  name: string
  path: string
  init?: RequestInit
  expectedStatus: number
  expectedText?: string
  expectedErrorText?: string
}

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

async function expectRouteContract(contract: RouteContract) {
  const response = await fetchRouteContract(contract)
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '')

  if (response.status !== contract.expectedStatus) {
    throw new Error(
      `${contract.name} expected ${contract.expectedStatus}, got ${response.status}: ${JSON.stringify(body)}`
    )
  }

  const searchable = typeof body === 'string' ? body : JSON.stringify(body)
  if (contract.expectedText && !searchable.includes(contract.expectedText)) {
    throw new Error(
      `${contract.name} missing expected text "${contract.expectedText}"`
    )
  }
  if (
    contract.expectedErrorText &&
    !searchable.includes(contract.expectedErrorText)
  ) {
    throw new Error(
      `${contract.name} missing expected error text "${contract.expectedErrorText}"`
    )
  }

  console.log(`stress route ok ${contract.name}`)
}

async function fetchRouteContract(contract: RouteContract) {
  const url = `${baseUrl}${contract.path}`
  let lastError: unknown

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fetch(url, contract.init)
    } catch (error) {
      lastError = error
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
      }
    }
  }

  throw lastError
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

async function getDrizzleSeedDeps() {
  const [
    { ensureWorkspaceForUser },
    { db },
    { apiKeys, usageEvents, workspaces }
  ] = await Promise.all([
    import('../lib/actions/api-keys'),
    import('../lib/db'),
    import('../lib/db/schema')
  ])

  return { ensureWorkspaceForUser, db, apiKeys, usageEvents, workspaces }
}

async function gotoForSmoke(page: Page, path: string) {
  let lastError: unknown

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await page.goto(`${baseUrl}${path}`, {
        waitUntil: 'domcontentloaded',
        timeout: browserNavigationTimeoutMs
      })
    } catch (error) {
      lastError = error
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
      }
    }
  }

  throw lastError
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
        monthlyBudgetKey: body.monthlyBudgetKey as string,
        pausedKey: body.pausedKey as string,
        revokedKey: body.revokedKey as string,
        expiredKey: body.expiredKey as string
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
  const deps = await getDrizzleSeedDeps()
  const workspace = await deps.ensureWorkspaceForUser(stressUserId)
  await deps.db
    .update(deps.workspaces)
    .set({ monthlyBudgetCents: seedMonthlyBudgetCents })
    .where(eq(deps.workspaces.id, workspace.id))

  const mainKey = await createStressKey(deps, workspace.id, {
    name: 'Stress Main Key',
    environment: 'test',
    scopes: ['chat:write', 'search:write', 'code:write', 'usage:read'],
    allowedModels: [],
    rpmLimit: 5,
    dailyRequestLimit: 5000,
    monthlyBudgetCents: seedMonthlyBudgetCents
  })

  const lowRpmKey = await createStressKey(deps, workspace.id, {
    name: 'Stress Low RPM Key',
    environment: 'test',
    scopes: ['chat:write', 'usage:read'],
    allowedModels: ['brok-lite'],
    rpmLimit: 1,
    dailyRequestLimit: 5000,
    monthlyBudgetCents: seedMonthlyBudgetCents
  })

  const dailyLimitedKey = await createStressKey(deps, workspace.id, {
    name: 'Stress Daily Limited Key',
    environment: 'test',
    scopes: ['chat:write'],
    allowedModels: ['brok-lite'],
    rpmLimit: 5,
    dailyRequestLimit: 1,
    monthlyBudgetCents: 0
  })
  await deps.db.insert(deps.usageEvents).values({
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

  const monthlyBudgetKey = await createStressKey(deps, workspace.id, {
    name: 'Stress Monthly Budget Key',
    environment: 'test',
    scopes: ['chat:write'],
    allowedModels: ['brok-lite'],
    rpmLimit: 5,
    dailyRequestLimit: 5000,
    monthlyBudgetCents: 1
  })
  await deps.db.insert(deps.usageEvents).values({
    requestId: `stress_budget_${Date.now()}`,
    workspaceId: workspace.id,
    userId: stressUserId,
    apiKeyId: monthlyBudgetKey.id,
    endpoint: 'chat',
    model: 'brok-lite',
    provider: 'Brok',
    inputTokens: 1,
    outputTokens: 1,
    providerCostUsd: '0.01',
    billedUsd: '0.01',
    latencyMs: 1,
    status: 'success'
  })

  const pausedKey = await createStressKey(deps, workspace.id, {
    name: 'Stress Paused Key',
    environment: 'test',
    scopes: ['chat:write'],
    allowedModels: ['brok-lite'],
    rpmLimit: 5,
    dailyRequestLimit: 5000,
    monthlyBudgetCents: 0
  })
  await deps.db
    .update(deps.apiKeys)
    .set({ status: 'paused' })
    .where(eq(deps.apiKeys.id, pausedKey.id))

  const revokedKey = await createStressKey(deps, workspace.id, {
    name: 'Stress Revoked Key',
    environment: 'test',
    scopes: ['chat:write'],
    allowedModels: ['brok-lite'],
    rpmLimit: 5,
    dailyRequestLimit: 5000,
    monthlyBudgetCents: 0
  })
  await deps.db
    .update(deps.apiKeys)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(eq(deps.apiKeys.id, revokedKey.id))

  const expiredKey = await createStressKey(deps, workspace.id, {
    name: 'Stress Expired Key',
    environment: 'test',
    scopes: ['usage:read'],
    allowedModels: ['brok-lite'],
    rpmLimit: 5,
    dailyRequestLimit: 5000,
    monthlyBudgetCents: 0,
    expiresAt: new Date(Date.now() - 60_000)
  })

  return {
    workspaceId: workspace.id,
    mainKey: mainKey.key,
    lowRpmKey: lowRpmKey.key,
    dailyLimitedKey: dailyLimitedKey.key,
    monthlyBudgetKey: monthlyBudgetKey.key,
    pausedKey: pausedKey.key,
    revokedKey: revokedKey.key,
    expiredKey: expiredKey.key
  }
}

async function createStressKeysWithSupabaseRest() {
  const workspace = await ensureWorkspaceForUserViaSupabaseRest(stressUserId)
  await updateWorkspaceMonthlyBudgetViaSupabaseRest(
    workspace.id,
    seedMonthlyBudgetCents
  )

  const mainKey = await createStressKeyViaSupabaseRest(workspace.id, {
    name: 'Stress Main Key',
    environment: 'test',
    scopes: ['chat:write', 'search:write', 'code:write', 'usage:read'],
    allowedModels: [],
    rpmLimit: 5,
    dailyRequestLimit: 5000,
    monthlyBudgetCents: seedMonthlyBudgetCents
  })

  const lowRpmKey = await createStressKeyViaSupabaseRest(workspace.id, {
    name: 'Stress Low RPM Key',
    environment: 'test',
    scopes: ['chat:write', 'usage:read'],
    allowedModels: ['brok-lite'],
    rpmLimit: 1,
    dailyRequestLimit: 5000,
    monthlyBudgetCents: seedMonthlyBudgetCents
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

  const monthlyBudgetKey = await createStressKeyViaSupabaseRest(workspace.id, {
    name: 'Stress Monthly Budget Key',
    environment: 'test',
    scopes: ['chat:write'],
    allowedModels: ['brok-lite'],
    rpmLimit: 5,
    dailyRequestLimit: 5000,
    monthlyBudgetCents: 1
  })
  await createUsageEventViaSupabaseRest({
    request_id: `stress_budget_${Date.now()}`,
    workspace_id: workspace.id,
    user_id: stressUserId,
    api_key_id: monthlyBudgetKey.id,
    endpoint: 'chat',
    model: 'brok-lite',
    provider: 'Brok',
    input_tokens: 1,
    output_tokens: 1,
    provider_cost_usd: '0.01',
    billed_usd: '0.01',
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

  const expiredKey = await createStressKeyViaSupabaseRest(workspace.id, {
    name: 'Stress Expired Key',
    environment: 'test',
    scopes: ['usage:read'],
    allowedModels: ['brok-lite'],
    rpmLimit: 5,
    dailyRequestLimit: 5000,
    monthlyBudgetCents: 0,
    expiresAt: new Date(Date.now() - 60_000)
  })

  return {
    workspaceId: workspace.id,
    mainKey: mainKey.key,
    lowRpmKey: lowRpmKey.key,
    dailyLimitedKey: dailyLimitedKey.key,
    monthlyBudgetKey: monthlyBudgetKey.key,
    pausedKey: pausedKey.key,
    revokedKey: revokedKey.key,
    expiredKey: expiredKey.key
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
    expiresAt?: Date | null
  }
) {
  const rawKey = generateApiKey(input.environment)
  const { hash: keyHash, salt: keySalt } = hashNewApiKey(rawKey)
  const created = await createApiKeyViaSupabaseRest({
    workspace_id: workspaceId,
    user_id: stressUserId,
    name: input.name,
    key_prefix: getKeyPrefix(rawKey),
    key_hash: keyHash,
    key_salt: keySalt,
    environment: input.environment,
    scopes: input.scopes,
    allowed_models: input.allowedModels,
    rpm_limit: input.rpmLimit,
    daily_request_limit: input.dailyRequestLimit,
    monthly_budget_cents: input.monthlyBudgetCents,
    expires_at: input.expiresAt?.toISOString() ?? null
  })

  return { ...created, key: rawKey }
}

async function createStressKey(
  deps: Awaited<ReturnType<typeof getDrizzleSeedDeps>>,
  workspaceId: string,
  input: {
    name: string
    environment: 'test' | 'live'
    scopes: string[]
    allowedModels: string[]
    rpmLimit: number
    dailyRequestLimit: number
    monthlyBudgetCents: number
    expiresAt?: Date | null
  }
) {
  const rawKey = generateApiKey(input.environment)
  const { hash: keyHash, salt: keySalt } = hashNewApiKey(rawKey)
  const [created] = await deps.db
    .insert(deps.apiKeys)
    .values({
      workspaceId,
      userId: stressUserId,
      name: input.name,
      keyPrefix: getKeyPrefix(rawKey),
      keyHash,
      keySalt,
      environment: input.environment,
      scopes: input.scopes,
      allowedModels: input.allowedModels,
      rpmLimit: input.rpmLimit,
      dailyRequestLimit: input.dailyRequestLimit,
      monthlyBudgetCents: input.monthlyBudgetCents,
      expiresAt: input.expiresAt ?? null
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

async function runBrokCodeSecurityScan(baseKey: string) {
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

  await runBrokCodeSecurityScan(keys.mainKey)
  console.log('stress api ok brokcode security-scan route success')

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

  const expiredResponse = await fetch(`${baseUrl}/api/v1/usage`, {
    headers: {
      Authorization: `Bearer ${keys.expiredKey}`
    }
  })
  const expiredBody = await expectJson(expiredResponse, 403)
  if (expiredBody?.error?.code !== 'expired_key') {
    throw new Error('expired key did not return expired_key')
  }
  console.log('stress api ok expired key rejection')

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

  const monthlyBudgetResponse = await fetch(
    `${baseUrl}/api/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${keys.monthlyBudgetKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'brok-lite',
        stream: false,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'monthly budget check' }]
      })
    }
  )
  const monthlyBudgetBody = await expectJson(monthlyBudgetResponse, 402)
  if (monthlyBudgetBody?.error?.code !== 'api_key_monthly_budget_exceeded') {
    throw new Error(
      'monthly-budget key did not return api_key_monthly_budget_exceeded'
    )
  }
  console.log('stress api ok monthly budget enforcement')

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

async function runRouteContracts() {
  const contracts: RouteContract[] = [
    {
      name: 'GET /api/v1/usage rejects missing auth',
      path: '/api/v1/usage',
      expectedStatus: 401,
      expectedErrorText: 'authorization'
    },
    {
      name: 'POST /api/build/plan rejects invalid JSON',
      path: '/api/build/plan',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{'
      },
      expectedStatus: 400,
      expectedErrorText: 'Invalid JSON body.'
    },
    {
      name: 'POST /api/build/plan rejects empty prompt',
      path: '/api/build/plan',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: '' })
      },
      expectedStatus: 400,
      expectedErrorText: 'A non-empty prompt is required.'
    },
    {
      name: 'GET /api/brokmail/gmail/status requires auth',
      path: '/api/brokmail/gmail/status',
      expectedStatus: 401,
      expectedErrorText: 'Authentication required'
    },
    {
      name: 'GET /api/brokmail/gmail/threads requires auth',
      path: '/api/brokmail/gmail/threads',
      expectedStatus: 401,
      expectedErrorText: 'Authentication required'
    },
    {
      name: 'GET /api/brokmail/gcal/status requires auth',
      path: '/api/brokmail/gcal/status',
      expectedStatus: 401,
      expectedErrorText: 'Authentication required'
    },
    {
      name: 'GET /api/brokmail/gcal/events requires auth',
      path: '/api/brokmail/gcal/events',
      expectedStatus: 401,
      expectedErrorText: 'Authentication required'
    },
    {
      name: 'POST /api/brokmail/pi-agent requires auth before prompt work',
      path: '/api/brokmail/pi-agent',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Summarize inbox.' })
      },
      expectedStatus: 401,
      expectedErrorText: 'Authentication required'
    },
    {
      name: 'GET /api/brokcode/sessions rejects missing auth',
      path: '/api/brokcode/sessions',
      expectedStatus: 401,
      expectedErrorText: 'authorization'
    },
    {
      name: 'POST /api/brokcode/sessions rejects missing auth',
      path: '/api/brokcode/sessions',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: 'stress-route',
          source: 'tui',
          role: 'user',
          content: 'stress route contract'
        })
      },
      expectedStatus: 401,
      expectedErrorText: 'authorization'
    },
    {
      name: 'GET /api/search/stream/msg_missing returns 404 search error contract',
      path: '/api/search/stream/msg_missing',
      expectedStatus: 404,
      expectedErrorText: 'search_request_not_found'
    }
  ]

  for (const contract of contracts) {
    await expectRouteContract(contract)
  }
}

async function runBrowserChecks() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const pageErrors: string[] = []

  page.on('pageerror', error => {
    pageErrors.push(error.message)
  })

  try {
    const publicChecks = [
      { path: '/docs/brokcode', expectedText: 'Terminal TUI' },
      {
        path: '/docs/brokcode-api',
        expectedText: 'POST /api/brokcode/execute'
      },
      {
        path: '/docs/brokmail',
        expectedAnyText: [
          '/api/brokmail/gcal/events',
          '/api/brokmail/calendar/events'
        ]
      }
    ]
    const protectedChecks = [
      '/admin/brok',
      '/admin/brok/logs',
      '/admin/brok/providers',
      '/api-platform/usage',
      '/brokcode/tui',
      '/brokmail'
    ]

    for (const check of publicChecks) {
      pageErrors.length = 0
      const response = await gotoForSmoke(page, check.path)
      if (!response?.ok()) {
        throw new Error(
          `${check.path} expected 200, got ${response?.status() ?? 'no response'}`
        )
      }
      const bodyText = (await page.locator('body').innerText()).replace(
        /\s+/g,
        ' '
      )
      const matchFound = check.expectedText
        ? bodyText.includes(check.expectedText)
        : (check.expectedAnyText || []).some(text => bodyText.includes(text))

      if (!matchFound) {
        const expected = check.expectedAnyText
          ? check.expectedAnyText.join(', ')
          : check.expectedText
        throw new Error(`${check.path} missing text "${expected}"`)
      }
      if (pageErrors.length > 0) {
        throw new Error(`${check.path} page errors: ${pageErrors.join('; ')}`)
      }

      console.log(`stress ui public ok ${check.path}`)
    }

    for (const path of protectedChecks) {
      pageErrors.length = 0
      const response = await gotoForSmoke(page, path)
      const redirectLocation = response?.headers()['location'] ?? ''
      const redirectedToLogin =
        page.url().includes('/auth/login') && page.url().includes('redirectTo=')
      const explicitLoginRedirect =
        (response?.status() === 307 || response?.status() === 308) &&
        redirectLocation.includes('/auth/login') &&
        redirectLocation.includes('redirectTo=')

      if (!redirectedToLogin && !explicitLoginRedirect) {
        throw new Error(`${path} should redirect to login when unauthenticated`)
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
  await runRouteContracts()

  if (contractsOnly) {
    await runBrowserChecks()
    console.log('stress contracts ok')
    process.exit(0)
  }

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
