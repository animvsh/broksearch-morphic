'use client'

import { useMemo } from 'react'
import Link from 'next/link'

import { BROK_MODELS } from '@/lib/brok/models'

import { CopyButton } from '@/components/copy-button'

const pageContent = `# Chat Completions API

Build chat interfaces with Brok's Chat Completions API.
Brok Code uses the model ID \`brok-code\` and is OpenAI-compatible for Codex and other coding-agent tools.

## Endpoint

\`\`\`
POST https://api.brok.ai/v1/chat/completions
\`\`\`

## Request Body

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| model | string | Yes | The model ID (use \`brok-code\` for coding-agent tools) |
| messages | array | Yes | Array of message objects |
| temperature | number | No | Sampling temperature (0-2). Default: 0.7 |
| max_tokens | number | No | Maximum tokens to generate |
| stream | boolean | No | Enable streaming responses. Default: false |
| stop | array/string | No | Stop sequences |

## Messages Format

\`\`\`json
{
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ]
}
\`\`\`

### Message Roles

- \`system\` - Sets the assistant's behavior
- \`user\` - User's message
- \`assistant\` - Assistant's previous response

## Request Example

\`\`\`bash
curl https://api.brok.ai/v1/chat/completions \\
  -H "Authorization: Bearer brok_sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "brok-code",
    "messages": [
      {"role": "user", "content": "Review this function and suggest a safer implementation."}
    ],
    "temperature": 0.7,
    "max_tokens": 500
  }'
\`\`\`

## Response

\`\`\`json
{
  "id": "chatcmpl_abc123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "brok-code",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Here is the issue and a safer patch..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 150,
    "total_tokens": 170
  }
}
\`\`\`

## Streaming

Enable streaming for real-time responses:

\`\`\`bash
curl https://api.brok.ai/v1/chat/completions \\
  -H "Authorization: Bearer brok_sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "brok-code",
    "messages": [{"role": "user", "content": "Tell me a story"}],
    "stream": true
  }'
\`\`\`

### Streaming Response Format

\`\`\`
data: {"id":"chatcmpl_abc","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Once"},"finish_reason":null}]}

data: {"id":"chatcmpl_abc","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":" upon"},"finish_reason":null}]}

data: [DONE]
\`\`\`

## Available Models

| Model | Description | Input Cost | Output Cost | Max Tokens |
|-------|-------------|------------|-------------|------------|
${Object.entries(BROK_MODELS)
  .map(
    ([id, config]) =>
      `| \`${id}\` | ${config.description} | $${config.inputCostPerMillion}/1M | $${config.outputCostPerMillion}/1M | ${config.maxTokens} |`
  )
  .join('\n')}

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Invalid request parameters |
| 401 | Invalid or missing API key |
| 403 | Insufficient permissions |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
| 503 | Service temporarily unavailable |

## Next Steps

- [Search Completions](/docs/search-completions) - Add search-powered responses
- [Models](/docs/models) - Compare all available models
- [Rate Limits](/docs/rate-limits) - Understand your plan limits`

export default function ChatCompletionsPage() {
  const models = useMemo(
    () =>
      Object.entries(BROK_MODELS).map(([id, config]) => ({ id, ...config })),
    []
  )

  return (
    <div className="container py-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-bold">Chat Completions API</h1>
        <CopyButton content={pageContent} />
      </div>

      <div className="prose prose-neutral dark:prose-invert">
        <p className="text-xl text-muted-foreground">
          Build chat interfaces and coding agents with Brok&apos;s Chat
          Completions API. Use <code>brok-code</code> for Codex,
          Claude-code-style adapters, and other agentic coding tools.
        </p>

        <h2>Endpoint</h2>
        <pre className="bg-muted p-4 rounded-lg">
          <code>POST https://api.brok.ai/v1/chat/completions</code>
        </pre>

        <h2>Request Body</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">Parameter</th>
                <th className="text-left py-2 px-3">Type</th>
                <th className="text-left py-2 px-3">Required</th>
                <th className="text-left py-2 px-3">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">model</td>
                <td className="py-2 px-3">string</td>
                <td className="py-2 px-3">Yes</td>
                <td className="py-2 px-3">
                  The model ID. Use <code>brok-code</code> for coding tools.
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">messages</td>
                <td className="py-2 px-3">array</td>
                <td className="py-2 px-3">Yes</td>
                <td className="py-2 px-3">Array of message objects</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">temperature</td>
                <td className="py-2 px-3">number</td>
                <td className="py-2 px-3">No</td>
                <td className="py-2 px-3">
                  Sampling temperature (0-2). Default: 0.7
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">max_tokens</td>
                <td className="py-2 px-3">number</td>
                <td className="py-2 px-3">No</td>
                <td className="py-2 px-3">Maximum tokens to generate</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">stream</td>
                <td className="py-2 px-3">boolean</td>
                <td className="py-2 px-3">No</td>
                <td className="py-2 px-3">Enable streaming. Default: false</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-mono">stop</td>
                <td className="py-2 px-3">array/string</td>
                <td className="py-2 px-3">No</td>
                <td className="py-2 px-3">Stop sequences</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2>Messages Format</h2>
        <pre className="bg-muted p-4 rounded-lg">
          <code>{`{
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ]
}`}</code>
        </pre>

        <h3>Message Roles</h3>
        <ul>
          <li>
            <code>system</code> - Sets the assistant&apos;s behavior
          </li>
          <li>
            <code>user</code> - User&apos;s message
          </li>
          <li>
            <code>assistant</code> - Assistant&apos;s previous response
          </li>
        </ul>

        <h2>Request Example</h2>
        <pre className="bg-muted p-4 rounded-lg">
          <code>{`curl https://api.brok.ai/v1/chat/completions \\
  -H "Authorization: Bearer brok_sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "brok-code",
    "messages": [
      {"role": "user", "content": "Review this function and suggest a safer implementation."}
    ],
    "temperature": 0.7,
    "max_tokens": 500
  }'`}</code>
        </pre>

        <h2>Agentic Coding Tool Setup</h2>
        <pre className="bg-muted p-4 rounded-lg">
          <code>{`# OpenAI-compatible tools such as Codex
export OPENAI_API_KEY="brok_sk_live_your_key"
export OPENAI_BASE_URL="https://api.brok.ai/v1"
export OPENAI_MODEL="brok-code"

# Anthropic-compatible tools
export ANTHROPIC_API_KEY="brok_sk_live_your_key"
export ANTHROPIC_BASE_URL="https://api.brok.ai"
export ANTHROPIC_MODEL="brok-code"`}</code>
        </pre>

        <h2>Anthropic Messages Compatibility</h2>
        <pre className="bg-muted p-4 rounded-lg">
          <code>{`curl https://api.brok.ai/v1/messages \\
  -H "x-api-key: brok_sk_live_your_key" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "brok-code",
    "max_tokens": 1000,
    "messages": [
      {"role": "user", "content": "Find the bug in this diff."}
    ]
  }'`}</code>
        </pre>

        <h2>Response</h2>
        <pre className="bg-muted p-4 rounded-lg">
          <code>{`{
  "id": "chatcmpl_abc123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "brok-code",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Here is the issue and a safer patch..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 150,
    "total_tokens": 170
  }
}`}</code>
        </pre>

        <h2>Streaming</h2>
        <p>Enable streaming for real-time responses:</p>
        <pre className="bg-muted p-4 rounded-lg">
          <code>{`curl https://api.brok.ai/v1/chat/completions \\
  -H "Authorization: Bearer brok_sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "brok-code",
    "messages": [{"role": "user", "content": "Explain this failing test"}],
    "stream": true
  }'`}</code>
        </pre>

        <h3>Streaming Response Format</h3>
        <pre className="bg-muted p-4 rounded-lg text-sm">
          <code>{`data: {"id":"chatcmpl_abc","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Once"},"finish_reason":null}]}

data: {"id":"chatcmpl_abc","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":" upon"},"finish_reason":null}]}

data: [DONE]`}</code>
        </pre>

        <h2>Available Models</h2>
        <div className="space-y-4">
          {models.map(model => (
            <div key={model.id} className="border rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold">{model.name}</h3>
                  <code className="text-sm text-muted-foreground">
                    {model.id}
                  </code>
                </div>
                <div className="text-right text-sm">
                  <div>${model.inputCostPerMillion}/1M in</div>
                  <div className="text-muted-foreground">
                    ${model.outputCostPerMillion}/1M out
                  </div>
                </div>
              </div>
              <p className="text-muted-foreground text-sm">
                {model.description}
              </p>
              <div className="mt-2 text-xs text-muted-foreground">
                Max tokens: {model.maxTokens}
                {model.supportsStreaming && ' | Streaming supported'}
              </div>
            </div>
          ))}
        </div>

        <h2>Error Codes</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">Code</th>
                <th className="text-left py-2 px-3">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">400</td>
                <td className="py-2 px-3">Invalid request parameters</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">401</td>
                <td className="py-2 px-3">Invalid or missing API key</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">403</td>
                <td className="py-2 px-3">Insufficient permissions</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">429</td>
                <td className="py-2 px-3">Rate limit exceeded</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">500</td>
                <td className="py-2 px-3">Internal server error</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-mono">503</td>
                <td className="py-2 px-3">Service temporarily unavailable</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2>Next Steps</h2>
        <ul>
          <li>
            <Link href="/docs/search-completions">Search Completions</Link> -
            Add search-powered responses
          </li>
          <li>
            <Link href="/docs/models">Models</Link> - Compare all available
            models
          </li>
          <li>
            <Link href="/docs/rate-limits">Rate Limits</Link> - Understand your
            plan limits
          </li>
        </ul>
      </div>
    </div>
  )
}
