'use client'

import Link from 'next/link'

import { CopyButton } from '@/components/copy-button'

const pageContent = `# Error Codes Reference

Complete reference for Brok API error codes and how to handle them.

## HTTP Status Codes

| Status | Code | Description |
|--------|------|-------------|
| 200 | success | Request completed successfully |
| 400 | invalid_request | Invalid request parameters |
| 401 | unauthorized | Invalid or missing API key |
| 403 | forbidden | Insufficient permissions |
| 404 | not_found | Resource not found |
| 429 | rate_limit_exceeded | Rate limit exceeded |
| 500 | internal_error | Internal server error |
| 503 | service_unavailable | Service temporarily unavailable |

## Error Response Format

All errors follow a consistent format:

\`\`\`json
{
  "error": {
    "code": "error_code",
    "message": "Human readable message",
    "param": "parameter_name",
    "details": {}
  }
}
\`\`\`

## Error Codes

### Authentication Errors (401)

| Code | Message | Cause |
|------|---------|-------|
| invalid_api_key | Invalid API key provided | The API key format is incorrect |
| expired_api_key | API key has expired | Key has passed its expiration date |
| revoked_api_key | API key has been revoked | Key was manually revoked |

**How to handle:**
- Verify your API key is correct
- Check if the key is active in the dashboard
- Create a new key if necessary

### Permission Errors (403)

| Code | Message | Cause |
|------|---------|-------|
| model_not_allowed | Model not allowed for this key | The API key lacks permission for the requested model |
| feature_disabled | Feature not enabled | Your plan doesn&apos;t include this feature |
| quota_exceeded | Monthly quota exceeded | You&apos;ve reached your monthly spending limit |

**How to handle:**
- Check which models are allowed for your key
- Upgrade your plan for additional features
- Set up billing alerts to avoid quota issues

### Validation Errors (400)

| Code | Message | Cause |
|------|---------|-------|
| invalid_parameter | Invalid parameter value | A request parameter has an invalid value |
| missing_required_param | Missing required parameter | A required parameter was not provided |
| invalid_model | Model not found | The specified model does not exist |
| messages_too_long | Messages exceed max tokens | Input exceeds model&apos;s maximum context |

**How to handle:**
- Check the param field for which parameter is invalid
- Verify all required parameters are provided
- Ensure messages fit within the model&apos;s context window

### Rate Limit Errors (429)

| Code | Message | Cause |
|------|---------|-------|
| rate_limit_exceeded | Rate limit exceeded | Too many requests per minute |
| token_limit_exceeded | Token limit exceeded | Too many tokens per minute |
| daily_limit_exceeded | Daily limit exceeded | Daily request limit reached |

**How to handle:**
- Implement exponential backoff
- Cache responses when possible
- Consider upgrading your plan

### Server Errors (500, 503)

| Code | Message | Cause |
|------|---------|-------|
| internal_error | Internal server error | Unexpected error on our side |
| service_unavailable | Service temporarily unavailable | System maintenance or overload |

**How to handle:**
- Retry with exponential backoff
- Check our status page for ongoing issues
- Contact support if errors persist

## Error Handling Example

\`\`\`javascript
async function makeBrokRequest(payload) {
  try {
    const response = await fetch('https://api.brok.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': \`Bearer \${process.env.BROK_API_KEY}\`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const error = await response.json()

      switch (error.error.code) {
        case 'invalid_api_key':
          console.error('Check your API key')
          break
        case 'rate_limit_exceeded':
          const retryAfter = response.headers.get('X-RateLimit-Retry-After')
          await sleep(retryAfter * 1000)
          return makeBrokRequest(payload)
        case 'model_not_allowed':
          console.error('Upgrade your plan')
          break
        default:
          console.error(\`API Error: \${error.error.message}\`)
      }
      throw error
    }

    return await response.json()
  } catch (error) {
    console.error('Request failed:', error)
    throw error
  }
}
\`\`\`

## Retry Guidelines

| Error Type | Retry? | Strategy |
|------------|--------|----------|
| 401 Errors | No | Fix credentials |
| 403 Errors | No | Check permissions |
| 400 Errors | No | Fix request |
| 429 Errors | Yes | Exponential backoff |
| 500 Errors | Yes | Exponential backoff |
| 503 Errors | Yes | Exponential backoff |

## Next Steps

- [Chat Completions](/docs/chat-completions) - Make successful API calls
- [Rate Limits](/docs/rate-limits) - Avoid rate limit errors
- [Security](/docs/security) - Keep your API key secure`

export default function ErrorsPage() {
  return (
    <div className="container py-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-bold">Error Codes Reference</h1>
        <CopyButton content={pageContent} />
      </div>

      <div className="prose prose-neutral dark:prose-invert">
        <p className="text-xl text-muted-foreground">
          Complete reference for Brok API error codes and how to handle them.
        </p>

        <h2>HTTP Status Codes</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">Status</th>
                <th className="text-left py-2 px-3">Code</th>
                <th className="text-left py-2 px-3">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">200</td>
                <td className="py-2 px-3">success</td>
                <td className="py-2 px-3">Request completed successfully</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">400</td>
                <td className="py-2 px-3">invalid_request</td>
                <td className="py-2 px-3">Invalid request parameters</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">401</td>
                <td className="py-2 px-3">unauthorized</td>
                <td className="py-2 px-3">Invalid or missing API key</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">403</td>
                <td className="py-2 px-3">forbidden</td>
                <td className="py-2 px-3">Insufficient permissions</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">404</td>
                <td className="py-2 px-3">not_found</td>
                <td className="py-2 px-3">Resource not found</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">429</td>
                <td className="py-2 px-3">rate_limit_exceeded</td>
                <td className="py-2 px-3">Rate limit exceeded</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">500</td>
                <td className="py-2 px-3">internal_error</td>
                <td className="py-2 px-3">Internal server error</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-mono">503</td>
                <td className="py-2 px-3">service_unavailable</td>
                <td className="py-2 px-3">Service temporarily unavailable</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2>Error Response Format</h2>
        <p>All errors follow a consistent format:</p>
        <pre className="bg-muted p-4 rounded-lg">
          <code>{`{
  "error": {
    "code": "error_code",
    "message": "Human readable message",
    "param": "parameter_name",
    "details": {}
  }
}`}</code>
        </pre>

        <h2>Error Codes</h2>

        <h3>Authentication Errors (401)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">Code</th>
                <th className="text-left py-2 px-3">Message</th>
                <th className="text-left py-2 px-3">Cause</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">invalid_api_key</td>
                <td className="py-2 px-3">Invalid API key provided</td>
                <td className="py-2 px-3">The API key format is incorrect</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">expired_api_key</td>
                <td className="py-2 px-3">API key has expired</td>
                <td className="py-2 px-3">
                  Key has passed its expiration date
                </td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-mono">revoked_api_key</td>
                <td className="py-2 px-3">API key has been revoked</td>
                <td className="py-2 px-3">Key was manually revoked</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 my-4">
          <p className="text-yellow-800">
            <strong>How to handle:</strong> Verify your API key is correct,
            check if the key is active in the dashboard, or create a new key if
            necessary.
          </p>
        </div>

        <h3>Permission Errors (403)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">Code</th>
                <th className="text-left py-2 px-3">Message</th>
                <th className="text-left py-2 px-3">Cause</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">model_not_allowed</td>
                <td className="py-2 px-3">Model not allowed for this key</td>
                <td className="py-2 px-3">
                  The API key lacks permission for the requested model
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">feature_disabled</td>
                <td className="py-2 px-3">Feature not enabled</td>
                <td className="py-2 px-3">
                  Your plan doesn&apos;t include this feature
                </td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-mono">quota_exceeded</td>
                <td className="py-2 px-3">Monthly quota exceeded</td>
                <td className="py-2 px-3">
                  You&apos;ve reached your monthly spending limit
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 my-4">
          <p className="text-yellow-800">
            <strong>How to handle:</strong> Check which models are allowed for
            your key, upgrade your plan for additional features, or set up
            billing alerts to avoid quota issues.
          </p>
        </div>

        <h3>Validation Errors (400)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">Code</th>
                <th className="text-left py-2 px-3">Message</th>
                <th className="text-left py-2 px-3">Cause</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">invalid_parameter</td>
                <td className="py-2 px-3">Invalid parameter value</td>
                <td className="py-2 px-3">
                  A request parameter has an invalid value
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">missing_required_param</td>
                <td className="py-2 px-3">Missing required parameter</td>
                <td className="py-2 px-3">
                  A required parameter was not provided
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">invalid_model</td>
                <td className="py-2 px-3">Model not found</td>
                <td className="py-2 px-3">
                  The specified model does not exist
                </td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-mono">messages_too_long</td>
                <td className="py-2 px-3">Messages exceed max tokens</td>
                <td className="py-2 px-3">
                  Input exceeds model&apos;s maximum context
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 my-4">
          <p className="text-yellow-800">
            <strong>How to handle:</strong> Check the param field for which
            parameter is invalid, verify all required parameters are provided,
            and ensure messages fit within the model&apos;s context window.
          </p>
        </div>

        <h3>Rate Limit Errors (429)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">Code</th>
                <th className="text-left py-2 px-3">Message</th>
                <th className="text-left py-2 px-3">Cause</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">rate_limit_exceeded</td>
                <td className="py-2 px-3">Rate limit exceeded</td>
                <td className="py-2 px-3">Too many requests per minute</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">token_limit_exceeded</td>
                <td className="py-2 px-3">Token limit exceeded</td>
                <td className="py-2 px-3">Too many tokens per minute</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-mono">daily_limit_exceeded</td>
                <td className="py-2 px-3">Daily limit exceeded</td>
                <td className="py-2 px-3">Daily request limit reached</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 my-4">
          <p className="text-yellow-800">
            <strong>How to handle:</strong> Implement exponential backoff, cache
            responses when possible, or consider upgrading your plan.
          </p>
        </div>

        <h3>Server Errors (500, 503)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">Code</th>
                <th className="text-left py-2 px-3">Message</th>
                <th className="text-left py-2 px-3">Cause</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">internal_error</td>
                <td className="py-2 px-3">Internal server error</td>
                <td className="py-2 px-3">Unexpected error on our side</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-mono">service_unavailable</td>
                <td className="py-2 px-3">Service temporarily unavailable</td>
                <td className="py-2 px-3">System maintenance or overload</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 my-4">
          <p className="text-yellow-800">
            <strong>How to handle:</strong> Retry with exponential backoff,
            check our status page for ongoing issues, or contact support if
            errors persist.
          </p>
        </div>

        <h2>Error Handling Example</h2>
        <pre className="bg-muted p-4 rounded-lg">
          <code>{`async function makeBrokRequest(payload) {
  try {
    const response = await fetch('https://api.brok.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': \`Bearer \${process.env.BROK_API_KEY}\`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const error = await response.json()

      switch (error.error.code) {
        case 'invalid_api_key':
          console.error('Check your API key')
          break
        case 'rate_limit_exceeded':
          const retryAfter = response.headers.get('X-RateLimit-Retry-After')
          await sleep(retryAfter * 1000)
          return makeBrokRequest(payload)
        case 'model_not_allowed':
          console.error('Upgrade your plan')
          break
        default:
          console.error(\`API Error: \${error.error.message}\`)
      }
      throw error
    }

    return await response.json()
  } catch (error) {
    console.error('Request failed:', error)
    throw error
  }
}`}</code>
        </pre>

        <h2>Retry Guidelines</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">Error Type</th>
                <th className="text-left py-2 px-3">Retry?</th>
                <th className="text-left py-2 px-3">Strategy</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 px-3">401 Errors</td>
                <td className="py-2 px-3 text-red-600">No</td>
                <td className="py-2 px-3">Fix credentials</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3">403 Errors</td>
                <td className="py-2 px-3 text-red-600">No</td>
                <td className="py-2 px-3">Check permissions</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3">400 Errors</td>
                <td className="py-2 px-3 text-red-600">No</td>
                <td className="py-2 px-3">Fix request</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3">429 Errors</td>
                <td className="py-2 px-3 text-green-600">Yes</td>
                <td className="py-2 px-3">Exponential backoff</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3">500 Errors</td>
                <td className="py-2 px-3 text-green-600">Yes</td>
                <td className="py-2 px-3">Exponential backoff</td>
              </tr>
              <tr>
                <td className="py-2 px-3">503 Errors</td>
                <td className="py-2 px-3 text-green-600">Yes</td>
                <td className="py-2 px-3">Exponential backoff</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2>Next Steps</h2>
        <ul>
          <li>
            <Link href="/docs/chat-completions">Chat Completions</Link> - Make
            successful API calls
          </li>
          <li>
            <Link href="/docs/rate-limits">Rate Limits</Link> - Avoid rate limit
            errors
          </li>
          <li>
            <Link href="/docs/security">Security</Link> - Keep your API key
            secure
          </li>
        </ul>
      </div>
    </div>
  )
}
