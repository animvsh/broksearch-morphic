'use client'

import Link from 'next/link'

import { CopyButton } from '@/components/copy-button'

const pageContent = `# Rate Limits

Understand Brok&apos;s rate limits and how to handle them.

## Rate Limit Tiers

| Plan | RPM | TPM | Daily Limit |
|------|-----|-----|-------------|
| Free | 20 | 40,000 | 1,000 |
| Starter | 60 | 120,000 | 50,000 |
| Pro | 300 | 500,000 | 500,000 |
| Enterprise | Custom | Custom | Custom |

RPM = Requests Per Minute
TPM = Tokens Per Minute

## Rate Limit Headers

When you make an API request, rate limit information is included in response headers:

\`\`\`
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1677652288
X-RateLimit-Retry-After: 32
\`\`\`

### Header Descriptions

| Header | Description |
|--------|-------------|
| X-RateLimit-Limit | Maximum requests allowed per minute |
| X-RateLimit-Remaining | Requests remaining in current window |
| X-RateLimit-Reset | Unix timestamp when the limit resets |
| X-RateLimit-Retry-After | Seconds until you can retry (only on 429) |

## Checking Your Rate Limit

\`\`\`javascript
async function makeRequest() {
  const response = await fetch('https://api.brok.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer brok_sk_live_your_key',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'brok-lite',
      messages: [{ role: 'user', content: 'Hello' }]
    })
  })

  // Check rate limit headers
  const limit = response.headers.get('X-RateLimit-Limit')
  const remaining = response.headers.get('X-RateLimit-Remaining')
  const reset = response.headers.get('X-RateLimit-Reset')

  console.log(\`Limit: \${limit}, Remaining: \${remaining}, Resets at: \${reset}\`)

  return response
}
\`\`\`

## Handling 429 Errors

When you exceed the rate limit, you&apos;ll receive a 429 response:

\`\`\`json
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Rate limit exceeded. Please retry after 32 seconds.",
    "retry_after": 32
  }
}
\`\`\`

### Retry Strategy

Implement exponential backoff when handling rate limits:

\`\`\`javascript
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      if (error.status === 429) {
        const retryAfter = error.headers?.['retry-after'] || Math.pow(2, i)
        await new Promise(r => setTimeout(r, retryAfter * 1000))
      } else {
        throw error
      }
    }
  }
  throw new Error('Max retries exceeded')
}
\`\`\`

## Best Practices

1. **Implement caching** - Cache responses for identical queries
2. **Use streaming** - Reduce request count for long responses
3. **Batch requests** - Combine multiple queries when possible
4. **Monitor usage** - Track your usage patterns
5. **Set up alerts** - Get notified before hitting limits

## Rate Limit Increase

Contact support to request rate limit increases for your account. Include:
- Your current usage patterns
- Expected growth
- Use case requirements

## Next Steps

- [Chat Completions](/docs/chat-completions) - Make your first API call
- [Errors](/docs/errors) - Handle errors gracefully
- [Security](/docs/security) - Secure your API usage`

export default function RateLimitsPage() {
  return (
    <div className="container py-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-bold">Rate Limits</h1>
        <CopyButton content={pageContent} />
      </div>

      <div className="prose prose-neutral dark:prose-invert">
        <p className="text-xl text-muted-foreground">
          Understand Brok&apos;s rate limits and how to handle them.
        </p>

        <h2>Rate Limit Tiers</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">Plan</th>
                <th className="text-left py-2 px-3">RPM</th>
                <th className="text-left py-2 px-3">TPM</th>
                <th className="text-left py-2 px-3">Daily Limit</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 px-3 font-semibold">Free</td>
                <td className="py-2 px-3">20</td>
                <td className="py-2 px-3">40,000</td>
                <td className="py-2 px-3">1,000</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-semibold">Starter</td>
                <td className="py-2 px-3">60</td>
                <td className="py-2 px-3">120,000</td>
                <td className="py-2 px-3">50,000</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-semibold">Pro</td>
                <td className="py-2 px-3">300</td>
                <td className="py-2 px-3">500,000</td>
                <td className="py-2 px-3">500,000</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-semibold">Enterprise</td>
                <td className="py-2 px-3">Custom</td>
                <td className="py-2 px-3">Custom</td>
                <td className="py-2 px-3">Custom</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          RPM = Requests Per Minute | TPM = Tokens Per Minute
        </p>

        <h2>Rate Limit Headers</h2>
        <p>When you make an API request, rate limit information is included in response headers:</p>
        <pre className="bg-muted p-4 rounded-lg">
          <code>{`X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1677652288
X-RateLimit-Retry-After: 32`}</code>
        </pre>

        <h3>Header Descriptions</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">Header</th>
                <th className="text-left py-2 px-3">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">X-RateLimit-Limit</td>
                <td className="py-2 px-3">Maximum requests allowed per minute</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">X-RateLimit-Remaining</td>
                <td className="py-2 px-3">Requests remaining in current window</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">X-RateLimit-Reset</td>
                <td className="py-2 px-3">Unix timestamp when the limit resets</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-mono">X-RateLimit-Retry-After</td>
                <td className="py-2 px-3">Seconds until you can retry (only on 429)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2>Checking Your Rate Limit</h2>
        <pre className="bg-muted p-4 rounded-lg">
          <code>{`async function makeRequest() {
  const response = await fetch('https://api.brok.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer brok_sk_live_your_key',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'brok-lite',
      messages: [{ role: 'user', content: 'Hello' }]
    })
  })

  // Check rate limit headers
  const limit = response.headers.get('X-RateLimit-Limit')
  const remaining = response.headers.get('X-RateLimit-Remaining')
  const reset = response.headers.get('X-RateLimit-Reset')

  console.log(\`Limit: \${limit}, Remaining: \${remaining}, Resets at: \${reset}\`)

  return response
}`}</code>
        </pre>

        <h2>Handling 429 Errors</h2>
        <p>When you exceed the rate limit, you&apos;ll receive a 429 response:</p>
        <pre className="bg-muted p-4 rounded-lg">
          <code>{`{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Rate limit exceeded. Please retry after 32 seconds.",
    "retry_after": 32
  }
}`}</code>
        </pre>

        <h3>Retry Strategy</h3>
        <p>Implement exponential backoff when handling rate limits:</p>
        <pre className="bg-muted p-4 rounded-lg">
          <code>{`async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      if (error.status === 429) {
        const retryAfter = error.headers?.['retry-after'] || Math.pow(2, i)
        await new Promise(r => setTimeout(r, retryAfter * 1000))
      } else {
        throw error
      }
    }
  }
  throw new Error('Max retries exceeded')
}`}</code>
        </pre>

        <h2>Best Practices</h2>
        <ol>
          <li><strong>Implement caching</strong> - Cache responses for identical queries</li>
          <li><strong>Use streaming</strong> - Reduce request count for long responses</li>
          <li><strong>Batch requests</strong> - Combine multiple queries when possible</li>
          <li><strong>Monitor usage</strong> - Track your usage patterns</li>
          <li><strong>Set up alerts</strong> - Get notified before hitting limits</li>
        </ol>

        <h2>Rate Limit Increase</h2>
        <p>Contact support to request rate limit increases for your account. Include:</p>
        <ul>
          <li>Your current usage patterns</li>
          <li>Expected growth</li>
          <li>Use case requirements</li>
        </ul>

        <h2>Next Steps</h2>
        <ul>
          <li><Link href="/docs/chat-completions">Chat Completions</Link> - Make your first API call</li>
          <li><Link href="/docs/errors">Errors</Link> - Handle errors gracefully</li>
          <li><Link href="/docs/security">Security</Link> - Secure your API usage</li>
        </ul>
      </div>
    </div>
  )
}
