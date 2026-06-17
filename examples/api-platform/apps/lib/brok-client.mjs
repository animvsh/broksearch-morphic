const DEFAULT_BASE_URL = 'https://www.brok.fyi'

export function getBrokConfig() {
  const baseUrl = (process.env.BROK_BASE_URL || DEFAULT_BASE_URL).replace(
    /\/+$/,
    ''
  )
  const apiKey = process.env.BROK_API_KEY

  if (!apiKey) {
    throw new Error(
      'BROK_API_KEY is required. Export a scoped test key before running this sample.'
    )
  }

  return { baseUrl, apiKey }
}

export async function brokRequest(path, { method = 'GET', body } = {}) {
  const { baseUrl, apiKey } = getBrokConfig()
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'brok-api-sample-apps/1.0'
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null

  if (!response.ok) {
    const message = data?.error?.message || response.statusText
    const code = data?.error?.code || 'unknown_error'
    throw new Error(`${path} failed with ${response.status} ${code}: ${message}`)
  }

  return {
    data,
    requestId:
      response.headers.get('x-request-id') ||
      response.headers.get('x-brok-request-id') ||
      null
  }
}

export async function listModels() {
  const { data } = await brokRequest('/api/v1/models')
  return data?.data || []
}

export async function chatCompletion({
  model = 'brok-code',
  messages,
  maxTokens = 500,
  temperature = 0.2
}) {
  const { data, requestId } = await brokRequest('/api/v1/chat/completions', {
    method: 'POST',
    body: {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false
    }
  })

  return {
    content: data?.choices?.[0]?.message?.content || '',
    raw: data,
    requestId
  }
}

export async function searchCompletion({
  model = 'brok-search',
  query,
  searchDepth = 'basic',
  maxTokens = 700
}) {
  const { data, requestId } = await brokRequest('/api/v1/search/completions', {
    method: 'POST',
    body: {
      model,
      query,
      search_depth: searchDepth,
      max_tokens: maxTokens,
      stream: false
    }
  })

  return {
    content: data?.choices?.[0]?.message?.content || '',
    citations: data?.citations || [],
    raw: data,
    requestId
  }
}

export function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}
