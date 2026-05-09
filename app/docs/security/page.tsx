'use client'

import Link from 'next/link'

import { CopyButton } from '@/components/copy-button'

const pageContent = `# Security Best Practices

Keep your Brok API keys and applications secure.

## API Key Best Practices

### Store Keys Securely

Never hardcode API keys in your source code. Use environment variables:

\`\`\`bash
# .env file (never commit this!)
BROK_API_KEY=brok_sk_live_your_key_here
\`\`\`

\`\`\`javascript
// Use environment variables
const apiKey = process.env.BROK_API_KEY
\`\`\`

### Key Environments

| Prefix | Environment | Use Case |
|--------|-------------|----------|
| \`brok_sk_live_\` | Production | Real requests, actual costs |
| \`brok_sk_test_\` | Testing | Development, no charges |

### Key Rotation

Rotate your API keys regularly:

1. Create a new key in the dashboard
2. Update your application with the new key
3. Verify the new key works
4. Revoke the old key

### Key Permissions

When creating keys, only grant necessary permissions:

- Restrict to specific models
- Set rate limits appropriate for your use
- Set expiration dates for temporary access

## Application Security

### Server-Side Only

Always make API calls from your server, never from client-side code:

\`\`\`javascript
// BAD - Exposes your key
const response = await fetch('https://api.brok.ai/v1/chat/completions', {
  headers: { 'Authorization': 'Bearer ' + apiKey } // Key exposed!
})

// GOOD - Server handles the call
app.post('/api/chat', async (req, res) => {
  const response = await brok.chat.completions.create({
    messages: req.body.messages
  })
  res.json(response)
})
\`\`\`

### Input Validation

Always validate user input before sending to the API:

\`\`\`javascript
function validateInput(messages) {
  for (const msg of messages) {
    if (!msg.role || !msg.content) {
      throw new Error('Invalid message format')
    }
    if (msg.content.length > MAX_INPUT_LENGTH) {
      throw new Error('Input too long')
    }
  }
  return true
}
\`\`\`

### Rate Limiting

Implement rate limiting in your application:

\`\`\`javascript
const rateLimit = new Map()

function checkRateLimit(apiKey) {
  const now = Date.now()
  const limit = rateLimit.get(apiKey) || { count: 0, reset: now + 60000 }

  if (now > limit.reset) {
    limit.count = 0
    limit.reset = now + 60000
  }

  if (limit.count >= 60) {
    throw new Error('Rate limit exceeded')
  }

  limit.count++
  rateLimit.set(apiKey, limit)
}
\`\`\`

## Monitoring and Alerts

### Set Up Usage Alerts

Configure alerts in the dashboard:

- Daily usage threshold
- Monthly budget limits
- Unusual activity detection

### Audit Logs

Regularly review:
- API key usage in dashboard
- Failed authentication attempts
- Unusual request patterns

## Security Checklist

- [ ] API key stored in environment variable
- [ ] Using test keys for development
- [ ] Keys have appropriate rate limits
- [ ] Server-side API calls only
- [ ] Input validation implemented
- [ ] Usage alerts configured
- [ ] Old keys revoked after rotation
- [ ] HTTPS only for all requests

## Reporting Security Issues

If you discover a security vulnerability:

1. Email security@brok.ai immediately
2. Do not disclose publicly
3. We&apos;ll acknowledge within 24 hours
4. We&apos;ll fix and credit you (with permission)

## Next Steps

- [API Keys](/docs/api-keys) - Create and manage keys
- [Chat Completions](/docs/chat-completions) - Make secure API calls
- [Rate Limits](/docs/rate-limits) - Understand your limits`

export default function SecurityPage() {
  return (
    <div className="container py-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-bold">Security Best Practices</h1>
        <CopyButton content={pageContent} />
      </div>

      <div className="prose prose-neutral dark:prose-invert">
        <p className="text-xl text-muted-foreground">
          Keep your Brok API keys and applications secure.
        </p>

        <h2>API Key Best Practices</h2>

        <h3>Store Keys Securely</h3>
        <p>Never hardcode API keys in your source code. Use environment variables:</p>
        <pre className="bg-muted p-4 rounded-lg">
          <code>{`# .env file (never commit this!)
BROK_API_KEY=brok_sk_live_your_key_here`}</code>
        </pre>
        <pre className="bg-muted p-4 rounded-lg">
          <code>{`// Use environment variables
const apiKey = process.env.BROK_API_KEY`}</code>
        </pre>

        <h3>Key Environments</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">Prefix</th>
                <th className="text-left py-2 px-3">Environment</th>
                <th className="text-left py-2 px-3">Use Case</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">brok_sk_live_</td>
                <td className="py-2 px-3">Production</td>
                <td className="py-2 px-3">Real requests, actual costs</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-mono">brok_sk_test_</td>
                <td className="py-2 px-3">Testing</td>
                <td className="py-2 px-3">Development, no charges</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3>Key Rotation</h3>
        <p>Rotate your API keys regularly:</p>
        <ol>
          <li>Create a new key in the dashboard</li>
          <li>Update your application with the new key</li>
          <li>Verify the new key works</li>
          <li>Revoke the old key</li>
        </ol>

        <h3>Key Permissions</h3>
        <p>When creating keys, only grant necessary permissions:</p>
        <ul>
          <li>Restrict to specific models</li>
          <li>Set rate limits appropriate for your use</li>
          <li>Set expiration dates for temporary access</li>
        </ul>

        <h2>Application Security</h2>

        <h3>Server-Side Only</h3>
        <p>Always make API calls from your server, never from client-side code:</p>
        <pre className="bg-muted p-4 rounded-lg">
          <code>{`// BAD - Exposes your key
const response = await fetch('https://api.brok.ai/v1/chat/completions', {
  headers: { 'Authorization': 'Bearer ' + apiKey } // Key exposed!
})

// GOOD - Server handles the call
app.post('/api/chat', async (req, res) => {
  const response = await brok.chat.completions.create({
    messages: req.body.messages
  })
  res.json(response)
})`}</code>
        </pre>

        <h3>Input Validation</h3>
        <p>Always validate user input before sending to the API:</p>
        <pre className="bg-muted p-4 rounded-lg">
          <code>{`function validateInput(messages) {
  for (const msg of messages) {
    if (!msg.role || !msg.content) {
      throw new Error('Invalid message format')
    }
    if (msg.content.length > MAX_INPUT_LENGTH) {
      throw new Error('Input too long')
    }
  }
  return true
}`}</code>
        </pre>

        <h3>Rate Limiting</h3>
        <p>Implement rate limiting in your application:</p>
        <pre className="bg-muted p-4 rounded-lg">
          <code>{`const rateLimit = new Map()

function checkRateLimit(apiKey) {
  const now = Date.now()
  const limit = rateLimit.get(apiKey) || { count: 0, reset: now + 60000 }

  if (now > limit.reset) {
    limit.count = 0
    limit.reset = now + 60000
  }

  if (limit.count >= 60) {
    throw new Error('Rate limit exceeded')
  }

  limit.count++
  rateLimit.set(apiKey, limit)
}`}</code>
        </pre>

        <h2>Monitoring and Alerts</h2>

        <h3>Set Up Usage Alerts</h3>
        <p>Configure alerts in the dashboard:</p>
        <ul>
          <li>Daily usage threshold</li>
          <li>Monthly budget limits</li>
          <li>Unusual activity detection</li>
        </ul>

        <h3>Audit Logs</h3>
        <p>Regularly review:</p>
        <ul>
          <li>API key usage in dashboard</li>
          <li>Failed authentication attempts</li>
          <li>Unusual request patterns</li>
        </ul>

        <h2>Security Checklist</h2>
        <ul>
          <li>[ ] API key stored in environment variable</li>
          <li>[ ] Using test keys for development</li>
          <li>[ ] Keys have appropriate rate limits</li>
          <li>[ ] Server-side API calls only</li>
          <li>[ ] Input validation implemented</li>
          <li>[ ] Usage alerts configured</li>
          <li>[ ] Old keys revoked after rotation</li>
          <li>[ ] HTTPS only for all requests</li>
        </ul>

        <h2>Reporting Security Issues</h2>
        <p>If you discover a security vulnerability:</p>
        <ol>
          <li>Email security@brok.ai immediately</li>
          <li>Do not disclose publicly</li>
          <li>We&apos;ll acknowledge within 24 hours</li>
          <li>We&apos;ll fix and credit you (with permission)</li>
        </ol>

        <h2>Next Steps</h2>
        <ul>
          <li><Link href="/docs/api-keys">API Keys</Link> - Create and manage keys</li>
          <li><Link href="/docs/chat-completions">Chat Completions</Link> - Make secure API calls</li>
          <li><Link href="/docs/rate-limits">Rate Limits</Link> - Understand your limits</li>
        </ul>
      </div>
    </div>
  )
}
