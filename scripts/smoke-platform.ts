import { chromium } from 'playwright'

import { createApiKey, ensureWorkspaceForUser } from '../lib/actions/api-keys'

type UiCheck = {
  path: string
  expectedText: string
}

type ApiCheck = {
  name: string
  run: (baseUrl: string, apiKey: string) => Promise<void>
}

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001'
const smokeUserId = process.env.ANONYMOUS_USER_ID || 'anonymous-user'

const uiChecks: UiCheck[] = [
  { path: '/', expectedText: 'Ask anything' },
  { path: '/docs', expectedText: 'Brok Documentation' },
  { path: '/docs/quickstart', expectedText: 'Quickstart' },
  { path: '/playground', expectedText: 'Brok Playground' },
  { path: '/presentations', expectedText: 'Presentations' },
  { path: '/admin/brok', expectedText: 'Brok API' },
  { path: '/api-keys', expectedText: 'Brok API Keys' },
  { path: '/api-keys/new', expectedText: 'Create New API Key' }
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
  try {
    const workspace = await ensureWorkspaceForUser(smokeUserId)
    const key = await createApiKey(smokeUserId, workspace.id, {
      name: 'Smoke Test Key',
      environment: 'test',
      scopes: ['chat:write', 'search:write', 'usage:read'],
      allowedModels: [],
      rpmLimit: 60,
      dailyRequestLimit: 5000,
      monthlyBudgetCents: 0
    })

    return { workspaceId: workspace.id, apiKey: key.key, dbBacked: true }
  } catch (error) {
    console.warn(
      'smoke key setup failed, using development fallback key:',
      error instanceof Error ? error.message : error
    )
    return {
      workspaceId: 'dev_workspace',
      apiKey: process.env.BROK_SMOKE_API_KEY || 'brok_sk_local_smoke',
      dbBacked: false
    }
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
    const checksToRun = dbBacked
      ? uiChecks
      : uiChecks.filter(
          check =>
            !check.path.startsWith('/admin') &&
            !check.path.startsWith('/api-keys')
        )

    for (const check of checksToRun) {
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

      if (apiKeyName && check.path === '/api-keys' && !bodyText.includes(apiKeyName)) {
        throw new Error('/api-keys did not show the created smoke-test key')
      }

      if (pageErrors.length > 0) {
        throw new Error(`${check.path} page errors: ${pageErrors.join('; ')}`)
      }

      console.log(`ui ok ${check.path}`)
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
  await runApiChecks(apiKey)

  console.log('smoke ok')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
