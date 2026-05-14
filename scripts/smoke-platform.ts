import { eq } from 'drizzle-orm'
import { chromium } from 'playwright'

import { ensureWorkspaceForUser } from '../lib/actions/api-keys'
import { generateApiKey, getKeyPrefix, hashApiKey } from '../lib/api-key'
import { db } from '../lib/db'
import { apiKeys, chats, messages, parts } from '../lib/db/schema'

import {
  createApiKeyViaSupabaseRest,
  ensureWorkspaceForUserViaSupabaseRest,
  supabaseRest
} from './supabase-rest-seed'

type UiCheck = {
  path: string
  expectedText: string
}

type ProtectedUiCheck = {
  path: string
}

type ApiCheck = {
  name: string
  run: (baseUrl: string, apiKey: string) => Promise<void>
}

type ShareSeed = {
  chatId: string
  title: string
  userText: string
  assistantText: string
  cleanup: () => Promise<void>
}

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001'
const smokeUserId = process.env.ANONYMOUS_USER_ID || 'anonymous-user'

const uiChecks: UiCheck[] = [
  { path: '/', expectedText: 'Shift+Enter for newline' },
  { path: '/docs', expectedText: 'Brok Documentation' },
  { path: '/docs/quickstart', expectedText: 'Quickstart' },
  { path: '/docs/api-keys', expectedText: 'API Keys' },
  { path: '/playground', expectedText: 'BrokCode API' },
  { path: '/tools', expectedText: 'AI Humanizer' },
  { path: '/tools/humanizer', expectedText: 'Humanized Output' }
]

const protectedUiChecks: ProtectedUiCheck[] = [
  { path: '/admin/brok' },
  { path: '/brokcode' },
  { path: '/brokmail' },
  { path: '/integrations' }
]

const apiChecks: ApiCheck[] = [
  {
    name: 'GET /api/v1/models',
    async run(url) {
      const response = await fetch(`${url}/api/v1/models`)
      const body = await response.json()

      if (!response.ok) {
        throw new Error(`expected 200, got ${response.status}`)
      }

      if (!Array.isArray(body.data) || body.data.length === 0) {
        throw new Error('expected a non-empty model list')
      }

      const brokLite = body.data.find((model: any) => model.id === 'brok-lite')
      if (!brokLite?.supports_search || !brokLite?.supports_tools) {
        throw new Error('expected brok-lite to support search and tools')
      }
    }
  },
  {
    name: 'GET /api/v1/usage with auth',
    async run(url, apiKey) {
      const response = await fetch(`${url}/api/v1/usage`, {
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      })
      const body = await response.json()

      if (!response.ok) {
        throw new Error(`expected 200, got ${response.status}`)
      }

      if (!body.usage || typeof body.usage.requests !== 'number') {
        throw new Error('expected usage payload')
      }
    }
  },
  {
    name: 'POST /api/v1/chat/completions invalid model',
    async run(url, apiKey) {
      const response = await fetch(`${url}/api/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'not-a-real-model',
          messages: [{ role: 'user', content: 'hello' }]
        })
      })
      const body = await response.json()

      if (response.status !== 400) {
        throw new Error(`expected 400, got ${response.status}`)
      }

      if (body?.error?.code !== 'invalid_model') {
        throw new Error('expected invalid_model error')
      }
    }
  },
  {
    name: 'POST /api/v1/chat/completions brok-lite web_search',
    async run(url, apiKey) {
      const response = await fetch(`${url}/api/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'brok-lite',
          stream: false,
          max_tokens: 80,
          messages: [
            {
              role: 'user',
              content:
                'Search the web and answer briefly: what does capy.ad do?'
            }
          ],
          tools: [{ type: 'web_search', web_search: { top_n: 3 } }],
          tool_choice: { type: 'web_search', web_search: { top_n: 3 } }
        })
      })
      const body = await response.json()

      if (!response.ok) {
        throw new Error(
          `expected 200, got ${response.status}: ${JSON.stringify(body)}`
        )
      }

      if (body.model !== 'brok-lite') {
        throw new Error('expected brok-lite chat response')
      }

      if (!Array.isArray(body.choices) || body.choices.length === 0) {
        throw new Error('expected chat choices')
      }

      if (!Array.isArray(body.citations)) {
        throw new Error('expected web_search citations')
      }

      const searchQueries = Array.isArray(body.search_queries)
        ? body.search_queries
        : []
      if (
        !searchQueries.some((query: string) => query.includes('site:capy.ad'))
      ) {
        throw new Error('expected chat web_search to keep capy.ad domain')
      }
    }
  },
  {
    name: 'POST /api/v1/chat/completions respects tool_choice none',
    async run(url, apiKey) {
      const response = await fetch(`${url}/api/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'brok-lite',
          stream: false,
          max_tokens: 20,
          messages: [
            {
              role: 'user',
              content: 'Reply briefly: no search'
            }
          ],
          tools: [{ type: 'web_search', web_search: { top_n: 3 } }],
          tool_choice: 'none'
        })
      })
      const body = await response.json()

      if (!response.ok) {
        throw new Error(
          `expected 200, got ${response.status}: ${JSON.stringify(body)}`
        )
      }

      if ('citations' in body || 'search_queries' in body) {
        throw new Error('expected tool_choice none to skip web_search')
      }
    }
  },
  {
    name: 'POST /api/v1/chat/completions streams web_search metadata',
    async run(url, apiKey) {
      const response = await fetch(`${url}/api/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'brok-lite',
          stream: true,
          max_tokens: 80,
          messages: [
            {
              role: 'user',
              content:
                'Search the web and answer briefly: what does capy.ad do?'
            }
          ],
          tools: [{ type: 'web_search', web_search: { top_n: 3 } }],
          tool_choice: { type: 'web_search', web_search: { top_n: 3 } }
        })
      })
      const body = await response.text()

      if (!response.ok) {
        throw new Error(`expected 200, got ${response.status}: ${body}`)
      }

      if (!body.includes('citations') || !body.includes('search_queries')) {
        throw new Error('expected streamed web_search metadata')
      }
    }
  },
  {
    name: 'POST /api/v1/search/completions brok-lite',
    async run(url, apiKey) {
      const response = await fetch(`${url}/api/v1/search/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'brok-lite',
          search_depth: 'basic',
          stream: false,
          query: 'What does capy.ad do? Answer in one sentence.'
        })
      })
      const body = await response.json()

      if (!response.ok) {
        throw new Error(
          `expected 200, got ${response.status}: ${JSON.stringify(body)}`
        )
      }

      if (body.model !== 'brok-lite') {
        throw new Error('expected brok-lite search response')
      }

      if (!Array.isArray(body.citations)) {
        throw new Error('expected citations array')
      }

      const searchQueries = Array.isArray(body.search_queries)
        ? body.search_queries
        : []
      if (
        !searchQueries.some((query: string) => query.includes('site:capy.ad'))
      ) {
        throw new Error('expected explicit capy.ad search query')
      }
    }
  },
  {
    name: 'POST /api/v1/search/completions invalid model',
    async run(url, apiKey) {
      const response = await fetch(`${url}/api/v1/search/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: 'What is Brok?',
          model: 'not-a-real-model'
        })
      })
      const body = await response.json()

      if (response.status !== 400) {
        throw new Error(`expected 400, got ${response.status}`)
      }

      if (body?.error?.code !== 'invalid_model') {
        throw new Error('expected invalid_model error')
      }
    }
  },
  {
    name: 'GET /api/v1/usage without auth',
    async run(url) {
      const response = await fetch(`${url}/api/v1/usage`)
      const body = await response.json()

      if (response.status !== 401) {
        throw new Error(`expected 401, got ${response.status}`)
      }

      if (body?.error?.code !== 'missing_authorization') {
        throw new Error('expected missing_authorization error')
      }
    }
  }
]

async function createSmokeTestKey() {
  const smokeSeedToken = process.env.SMOKE_SEED_TOKEN
  if (smokeSeedToken) {
    const response = await fetch(`${baseUrl}/api/admin/brok/smoke-seed`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${smokeSeedToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        kind: 'smoke',
        userId: smokeUserId
      })
    })
    const body = await response.json().catch(() => null)

    if (response.ok && typeof body?.apiKey === 'string') {
      return {
        workspaceId: body.workspaceId as string,
        apiKey: body.apiKey as string,
        dbBacked: true
      }
    }

    console.warn(
      `smoke seed endpoint unavailable (${response.status}); falling back to local seeding`
    )
  }

  const rawKey = generateApiKey('test')

  try {
    const workspace = await ensureWorkspaceForUser(smokeUserId)

    await db.insert(apiKeys).values({
      workspaceId: workspace.id,
      userId: smokeUserId,
      name: 'Smoke Test Key',
      keyPrefix: getKeyPrefix(rawKey),
      keyHash: hashApiKey(rawKey),
      environment: 'test',
      scopes: ['chat:write', 'search:write', 'usage:read'],
      allowedModels: [],
      rpmLimit: 60,
      dailyRequestLimit: 5000,
      monthlyBudgetCents: 0
    })

    return { workspaceId: workspace.id, apiKey: rawKey, dbBacked: true }
  } catch (error) {
    console.warn(
      `smoke DB seed unavailable, using Supabase REST fallback: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    const workspace = await ensureWorkspaceForUserViaSupabaseRest(smokeUserId)
    await createApiKeyViaSupabaseRest({
      workspace_id: workspace.id,
      user_id: smokeUserId,
      name: 'Smoke Test Key',
      key_prefix: getKeyPrefix(rawKey),
      key_hash: hashApiKey(rawKey),
      environment: 'test',
      scopes: ['chat:write', 'search:write', 'usage:read'],
      allowed_models: [],
      rpm_limit: 60,
      daily_request_limit: 5000,
      monthly_budget_cents: 0
    })

    return { workspaceId: workspace.id, apiKey: rawKey, dbBacked: false }
  }
}

function makeSmokeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function encodePortableSharePayload(payload: unknown) {
  return Buffer.from(JSON.stringify(payload), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

async function createShareSeed(): Promise<ShareSeed> {
  const chatId = makeSmokeId('share-smoke-chat')
  const userMessageId = makeSmokeId('share-smoke-user')
  const assistantMessageId = makeSmokeId('share-smoke-assistant')
  const title = 'Share smoke public thread'
  const userText = 'Share smoke user prompt'
  const assistantText = 'Share smoke answer visible to signed-out visitors'

  const smokeSeedToken = process.env.SMOKE_SEED_TOKEN
  if (smokeSeedToken) {
    const response = await fetch(`${baseUrl}/api/admin/brok/smoke-seed`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${smokeSeedToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        kind: 'share',
        userId: smokeUserId,
        title,
        userText,
        assistantText
      })
    })
    const body = await response.json().catch(() => null)

    if (
      response.ok &&
      typeof body?.chatId === 'string' &&
      typeof body?.title === 'string' &&
      typeof body?.userText === 'string' &&
      typeof body?.assistantText === 'string'
    ) {
      return {
        chatId: body.chatId,
        title: body.title,
        userText: body.userText,
        assistantText: body.assistantText,
        cleanup: async () => {
          await fetch(`${baseUrl}/api/admin/brok/smoke-seed`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${smokeSeedToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              kind: 'share-cleanup',
              userId: smokeUserId,
              chatId: body.chatId
            })
          })
        }
      }
    }

    console.warn(
      `share seed endpoint unavailable (${response.status}); falling back to local seeding`
    )
  }

  try {
    await db.transaction(async tx => {
      await tx.insert(chats).values({
        id: chatId,
        title,
        userId: smokeUserId,
        visibility: 'public'
      })
      await tx.insert(messages).values([
        {
          id: userMessageId,
          chatId,
          role: 'user'
        },
        {
          id: assistantMessageId,
          chatId,
          role: 'assistant'
        }
      ])
      await tx.insert(parts).values([
        {
          id: makeSmokeId('share-smoke-user-part'),
          messageId: userMessageId,
          order: 0,
          type: 'text',
          text_text: userText
        },
        {
          id: makeSmokeId('share-smoke-assistant-part'),
          messageId: assistantMessageId,
          order: 0,
          type: 'text',
          text_text: assistantText
        }
      ])
    })

    return {
      chatId,
      title,
      userText,
      assistantText,
      cleanup: async () => {
        await db.delete(chats).where(eq(chats.id, chatId))
      }
    }
  } catch (error) {
    console.warn(
      `share DB seed unavailable, using Supabase REST fallback: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }

  await supabaseRest('chats', {
    method: 'POST',
    body: JSON.stringify({
      id: chatId,
      title,
      user_id: smokeUserId,
      visibility: 'public'
    })
  })
  await supabaseRest('messages', {
    method: 'POST',
    body: JSON.stringify([
      {
        id: userMessageId,
        chat_id: chatId,
        role: 'user'
      },
      {
        id: assistantMessageId,
        chat_id: chatId,
        role: 'assistant'
      }
    ])
  })
  await supabaseRest('parts', {
    method: 'POST',
    body: JSON.stringify([
      {
        id: makeSmokeId('share-smoke-user-part'),
        message_id: userMessageId,
        order: 0,
        type: 'text',
        text_text: userText
      },
      {
        id: makeSmokeId('share-smoke-assistant-part'),
        message_id: assistantMessageId,
        order: 0,
        type: 'text',
        text_text: assistantText
      }
    ])
  })

  return {
    chatId,
    title,
    userText,
    assistantText,
    cleanup: async () => {
      await supabaseRest(`chats?id=eq.${encodeURIComponent(chatId)}`, {
        method: 'DELETE',
        headers: {
          Prefer: 'return=minimal'
        }
      })
    }
  }
}

async function runShareChecks() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const pageErrors: string[] = []
  const seed = await createShareSeed()

  page.on('pageerror', error => {
    pageErrors.push(error.message)
  })

  try {
    const shareResponse = await page.goto(`${baseUrl}/search/${seed.chatId}`, {
      waitUntil: 'networkidle'
    })

    if (!shareResponse || !shareResponse.ok()) {
      throw new Error(
        `/search/${seed.chatId} expected 200, got ${
          shareResponse?.status() ?? 'no response'
        }`
      )
    }

    const shareText = (await page.locator('body').innerText()).replace(
      /\s+/g,
      ' '
    )

    const titleText = await page.title()
    if (!titleText.includes(seed.title.slice(0, 50))) {
      throw new Error(
        `/search/${seed.chatId} page title missing "${seed.title}"`
      )
    }

    for (const expectedText of [seed.userText, seed.assistantText]) {
      if (!shareText.includes(expectedText)) {
        throw new Error(
          `/search/${seed.chatId} missing shared text "${expectedText}"`
        )
      }
    }

    if (pageErrors.length > 0) {
      throw new Error(
        `/search/${seed.chatId} page errors: ${pageErrors.join('; ')}`
      )
    }

    console.log(`share ok /search/${seed.chatId}`)

    pageErrors.length = 0
    const portablePayload = encodePortableSharePayload({
      title: 'Portable BrokCode smoke share',
      createdAt: new Date().toISOString(),
      messages: [
        {
          role: 'user',
          content: 'Build a small notes app.'
        },
        {
          role: 'assistant',
          content: 'Created a compact notes app plan.'
        }
      ]
    })
    const portableResponse = await page.goto(
      `${baseUrl}/brokcode/shared?data=${portablePayload}`,
      { waitUntil: 'networkidle' }
    )

    if (!portableResponse || !portableResponse.ok()) {
      throw new Error(
        `/brokcode/shared expected 200, got ${
          portableResponse?.status() ?? 'no response'
        }`
      )
    }

    const portableText = (await page.locator('body').innerText()).replace(
      /\s+/g,
      ' '
    )
    for (const expectedText of [
      'Portable BrokCode smoke share',
      'Build a small notes app.',
      'Created a compact notes app plan.'
    ]) {
      if (!portableText.includes(expectedText)) {
        throw new Error(`/brokcode/shared missing text "${expectedText}"`)
      }
    }

    if (pageErrors.length > 0) {
      throw new Error(`/brokcode/shared page errors: ${pageErrors.join('; ')}`)
    }

    console.log('share ok /brokcode/shared')
  } finally {
    await seed.cleanup().catch(error => {
      console.warn(
        `share smoke cleanup failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    })
    await browser.close()
  }
}

async function runUiChecks(apiKeyName?: string, dbBacked = true) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const pageErrors: string[] = []

  page.on('pageerror', error => {
    pageErrors.push(error.message)
  })

  try {
    for (const check of uiChecks) {
      pageErrors.length = 0

      const response = await page.goto(`${baseUrl}${check.path}`, {
        waitUntil: 'networkidle'
      })

      if (!response || !response.ok()) {
        throw new Error(
          `${check.path} expected 200, got ${response?.status() ?? 'no response'}`
        )
      }

      const bodyText = (await page.locator('body').innerText()).replace(
        /\s+/g,
        ' '
      )

      if (!bodyText.includes(check.expectedText)) {
        throw new Error(`${check.path} missing text "${check.expectedText}"`)
      }

      if (
        apiKeyName &&
        check.path === '/api-keys' &&
        !bodyText.includes(apiKeyName)
      ) {
        throw new Error('/api-keys did not show the created smoke-test key')
      }

      if (pageErrors.length > 0) {
        throw new Error(`${check.path} page errors: ${pageErrors.join('; ')}`)
      }

      console.log(`ui ok ${check.path}`)
    }

    for (const check of protectedUiChecks) {
      pageErrors.length = 0

      const response = await page.goto(`${baseUrl}${check.path}`, {
        waitUntil: 'networkidle'
      })
      const currentUrl = page.url()
      const status = response?.status() ?? 0

      if (
        !currentUrl.includes('/auth/login') &&
        status !== 307 &&
        status !== 308
      ) {
        throw new Error(
          `${check.path} should redirect to /auth/login when unauthenticated; got ${currentUrl}`
        )
      }

      if (!currentUrl.includes('redirectTo=')) {
        throw new Error(`${check.path} login redirect missing redirectTo`)
      }

      if (pageErrors.length > 0) {
        throw new Error(`${check.path} page errors: ${pageErrors.join('; ')}`)
      }

      console.log(`ui protected ok ${check.path}`)
    }
  } finally {
    await browser.close()
  }
}

async function runApiChecks(apiKey: string) {
  for (const check of apiChecks) {
    await check.run(baseUrl, apiKey)
    console.log(`api ok ${check.name}`)
  }
}

async function main() {
  console.log(`smoke base ${baseUrl}`)
  const { workspaceId, apiKey, dbBacked } = await createSmokeTestKey()
  console.log(`smoke workspace ${workspaceId}`)

  await runUiChecks(dbBacked ? 'Smoke Test Key' : undefined, dbBacked)
  await runShareChecks()
  await runApiChecks(apiKey)

  console.log('smoke ok')
  process.exit(0)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
