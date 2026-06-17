#!/usr/bin/env node

const baseUrl = (process.env.BROK_BASE_URL || 'https://www.brok.fyi').replace(
  /\/+$/,
  ''
)
const apiKey = process.env.BROK_API_KEY

if (!apiKey) {
  console.error('missing BROK_API_KEY')
  console.error('example: export BROK_API_KEY="brok_sk_your_key"')
  process.exit(1)
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'User-Agent': 'brok-api-node-example/1.0'
}

const json = value => JSON.stringify(value, null, 2)

async function brokRequest(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers || {})
    }
  })
  const requestId =
    response.headers.get('x-request-id') ||
    response.headers.get('x-brok-request-id')
  const text = await response.text()
  const body = text ? JSON.parse(text) : null

  if (!response.ok) {
    const message = body?.error?.message || response.statusText
    throw new Error(`${path} failed with ${response.status}: ${message}`)
  }

  return { body, requestId, status: response.status }
}

function preview(value, maxLength = 280) {
  const text =
    typeof value === 'string' ? value : value === undefined ? '' : json(value)
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

console.log(`Brok API base URL: ${baseUrl}`)

const models = await brokRequest('/api/v1/models', {
  headers: { Accept: 'application/json' }
})
const modelIds = models.body.data?.map(model => model.id) || []
console.log(`models (${modelIds.length}): ${modelIds.join(', ')}`)

const chat = await brokRequest('/api/v1/chat/completions', {
  method: 'POST',
  body: JSON.stringify({
    model: 'brok-code',
    messages: [
      {
        role: 'user',
        content: 'Write a compact release checklist for an API client.'
      }
    ],
    temperature: 0.2,
    max_tokens: 500,
    stream: false
  })
})
console.log(`chat request id: ${chat.requestId || 'not returned'}`)
console.log(
  `chat preview: ${preview(chat.body.choices?.[0]?.message?.content || chat.body)}`
)

const search = await brokRequest('/api/v1/search/completions', {
  method: 'POST',
  body: JSON.stringify({
    model: 'brok-search',
    query: 'What should I verify before shipping a public API integration?',
    search_depth: 'standard',
    stream: false
  })
})
console.log(`search request id: ${search.requestId || 'not returned'}`)
console.log(
  `search preview: ${preview(
    search.body.choices?.[0]?.message?.content || search.body
  )}`
)
console.log(`search citations: ${search.body.citations?.length || 0}`)
