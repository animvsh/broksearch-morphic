'use client'

import { useMemo } from 'react'
import Link from 'next/link'

import { BROK_MODELS, BROK_PUBLIC_MODEL_IDS } from '@/lib/brok/models'

import { CopyButton } from '@/components/copy-button'

const pageContent = `# Search Completions API

Add search-powered AI responses with citations to your application.

## Endpoint

\`\`\`
POST https://api.brok.ai/v1/search/completions
\`\`\`

## Request Body

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| model | string | Yes | Any model with search enabled, including brok-lite, brok-search, brok-search-pro, and brok-agent |
| query | string | Yes | User&apos;s search query |
| search_depth | string | No | "lite", "standard", or "deep". Compatibility aliases: "basic" and "quick" for lite, "advanced" for deep. Default: "standard" |
| max_tokens | number | No | Maximum tokens to generate |
| temperature | number | No | Sampling temperature (0-2). Default: 0.7 |

## Search Depth

### Lite Search
- Returns 3-5 source citations
- Faster response times
- Best for simple factual queries

### Deep Research
- Returns 10-20 source citations
- Comprehensive research synthesis
- Best for complex research questions
- Higher cost due to increased search volume

## Citation Format

Citations are included in the response with:

\`\`\`json
{
  "citations": [
    {
      "index": 0,
      "url": "https://example.com/source",
      "title": "Source Title",
      "snippet": "Relevant text excerpt...",
      "domain": "example.com",
      "published_date": "2024-01-15"
    }
  ]
}
\`\`\`

## Request Example

\`\`\`bash
curl https://api.brok.ai/v1/search/completions \\
  -H "Authorization: Bearer brok_sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "brok-lite",
    "query": "What are the latest developments in AI?",
    "search_depth": "standard"
  }'
\`\`\`

## Response

\`\`\`json
{
  "id": "src_abc123",
  "object": "search.completion",
  "model": "brok-lite",
  "resolved_query": "What are the latest developments in AI?",
  "classification": "current",
  "search_queries": ["latest developments in AI"],
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "Recent AI development is moving across models, agents, and product integration..."
      }
    }
  ],
  "citations": [
    {
      "index": 0,
      "url": "https://techcrunch.com/2024/ai-developments",
      "title": "Latest AI Developments",
      "snippet": "Major tech companies have announced...",
      "domain": "techcrunch.com",
      "published_date": "2024-01-20"
    }
  ],
  "follow_ups": [
    "Which source changed most recently?"
  ],
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 200,
    "total_tokens": 215
  }
}
\`\`\`

## Streaming

Search completions also support streaming:

\`\`\`bash
curl https://api.brok.ai/v1/search/completions \\
  -H "Authorization: Bearer brok_sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "brok-lite",
    "query": "Latest AI news",
    "stream": true
  }'
\`\`\`

### Streaming Events

When \`stream\` is \`true\`, Brok returns Server-Sent Events. Clients should handle these canonical event names:

| Event | Payload | Purpose |
|-------|---------|---------|
| status | \`{ "message": "Searching the web" }\` | High-level progress updates |
| query | \`{ "resolved_query": "...", "search_queries": [...] }\` | Query rewriting and planned searches |
| source | \`{ "source_id": "src_1", "citation_number": 1, "title": "...", "url": "..." }\` | A usable source was found |
| citation | \`{ "source_id": "src_1", "citation_number": 1 }\` | Citation metadata for the answer |
| answer_delta | \`{ "text": "Brok should..." }\` | Answer text as it is generated |
| follow_ups | \`{ "items": [...] }\` | Suggested next questions |
| done | \`{ "usage": {...} }\` | Terminal usage and completion event |

\`\`\`text
event: status
data: {"message":"Understanding your question"}

event: query
data: {"resolved_query":"Latest AI news","search_queries":["Latest AI news"]}

event: source
data: {"source_id":"src_1","citation_number":1,"title":"...","url":"..."}

event: answer_delta
data: {"text":"Recent AI development is..."}

event: follow_ups
data: {"items":[{"label":"Which source changed most recently?","query":"Which source changed most recently?"}]}

event: done
data: {"usage":{"total_tokens":215}}
\`\`\`

## Available Search Models

| Model | Description | Input Cost | Output Cost | Search Depth |
|-------|-------------|------------|-------------|---------------|
${BROK_PUBLIC_MODEL_IDS.map(id => [id, BROK_MODELS[id]] as const)
  .filter(([, m]) => m.supportsSearch)
  .map(
    ([id, config]) =>
      `| \`${id}\` | ${config.description} | $${config.inputCostPerMillion}/1M | $${config.outputCostPerMillion}/1M | Lite: 3-5 sources${id === 'brok-search-pro' ? ', Deep: 10-20 sources' : ''} |`
  )
  .join('\n')}

## Use Cases

- **Research assistance** - Deep search for comprehensive reports
- **Fact-checking** - Quick lite search for verification
- **Content creation** - Search-powered content with citations
- **Customer support** - Knowledge base augmented responses

## Best Practices

1. Use lite search for simple factual queries
2. Use deep search for research reports and analysis
3. Always display citations for transparency
4. Respect source freshness by checking published_date
5. Handle rate limits gracefully

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Invalid query or parameters |
| 401 | Invalid or missing API key |
| 403 | Model does not support search |
| 429 | Rate limit exceeded |
| 500 | Search service error |
| 503 | Service temporarily unavailable |

## Next Steps

- [Chat Completions](/docs/chat-completions) - Standard chat API
- [Models](/docs/models) - All available models
- [Rate Limits](/docs/rate-limits) - Understanding limits`

export default function SearchCompletionsPage() {
  const searchModels = useMemo(
    () =>
      Object.entries(BROK_MODELS)
        .filter(([id, config]) => {
          return (
            BROK_PUBLIC_MODEL_IDS.includes(
              id as (typeof BROK_PUBLIC_MODEL_IDS)[number]
            ) && config.supportsSearch
          )
        })
        .map(([id, config]) => ({ id, ...config })),
    []
  )

  return (
    <div className="container py-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-bold">Search Completions API</h1>
        <CopyButton content={pageContent} />
      </div>

      <div className="prose prose-neutral dark:prose-invert">
        <p className="text-xl text-muted-foreground">
          Add search-powered AI responses with citations to your application.
        </p>

        <h2>Endpoint</h2>
        <pre className="bg-muted p-4 rounded-lg">
          <code>POST https://api.brok.ai/v1/search/completions</code>
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
                  Any model with search enabled, including brok-lite,
                  brok-search, brok-search-pro, and brok-agent
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">query</td>
                <td className="py-2 px-3">string</td>
                <td className="py-2 px-3">Yes</td>
                <td className="py-2 px-3">User&apos;s search query</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">search_depth</td>
                <td className="py-2 px-3">string</td>
                <td className="py-2 px-3">No</td>
                <td className="py-2 px-3">
                  &quot;lite&quot;, &quot;standard&quot;, or &quot;deep&quot;.
                  Compatibility aliases: &quot;basic&quot; and &quot;quick&quot;
                  for lite, &quot;advanced&quot; for deep. Default:
                  &quot;standard&quot;
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">max_tokens</td>
                <td className="py-2 px-3">number</td>
                <td className="py-2 px-3">No</td>
                <td className="py-2 px-3">Maximum tokens to generate</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-mono">temperature</td>
                <td className="py-2 px-3">number</td>
                <td className="py-2 px-3">No</td>
                <td className="py-2 px-3">
                  Sampling temperature (0-2). Default: 0.7
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2>Search Depth</h2>

        <h3>Lite Search</h3>
        <ul>
          <li>Returns 3-5 source citations</li>
          <li>Faster response times</li>
          <li>Best for simple factual queries</li>
        </ul>

        <h3>Deep Research</h3>
        <ul>
          <li>Returns 10-20 source citations</li>
          <li>Comprehensive research synthesis</li>
          <li>Best for complex research questions</li>
          <li>Higher cost due to increased search volume</li>
        </ul>

        <h2>Citation Format</h2>
        <p>Citations are included in the response with:</p>
        <pre className="bg-muted p-4 rounded-lg">
          <code>{`{
  "citations": [
    {
      "index": 0,
      "url": "https://example.com/source",
      "title": "Source Title",
      "snippet": "Relevant text excerpt...",
      "domain": "example.com",
      "published_date": "2024-01-15"
    }
  ]
}`}</code>
        </pre>

        <h2>Request Example</h2>
        <pre className="bg-muted p-4 rounded-lg">
          <code>{`curl https://api.brok.ai/v1/search/completions \\
  -H "Authorization: Bearer brok_sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "brok-lite",
    "query": "What are the latest developments in AI?",
    "search_depth": "standard"
  }'`}</code>
        </pre>

        <h2>Response</h2>
        <pre className="bg-muted p-4 rounded-lg">
          <code>{`{
  "id": "src_abc123",
  "object": "search.completion",
  "model": "brok-lite",
  "resolved_query": "What are the latest developments in AI?",
  "classification": "current",
  "search_queries": ["latest developments in AI"],
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "Recent AI development is moving across models, agents, and product integration..."
      }
    }
  ],
  "citations": [
    {
      "index": 0,
      "url": "https://techcrunch.com/2024/ai-developments",
      "title": "Latest AI Developments",
      "snippet": "Major tech companies have announced...",
      "domain": "techcrunch.com",
      "published_date": "2024-01-20"
    }
  ],
  "follow_ups": [
    "Which source changed most recently?"
  ],
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 200,
    "total_tokens": 215
  }
}`}</code>
        </pre>

        <h2>Streaming</h2>
        <p>Search completions also support streaming:</p>
        <pre className="bg-muted p-4 rounded-lg">
          <code>{`curl https://api.brok.ai/v1/search/completions \\
  -H "Authorization: Bearer brok_sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "brok-search",
    "query": "Latest AI news",
    "stream": true
  }'`}</code>
        </pre>

        <h3>Streaming Events</h3>
        <p>
          When <code>stream</code> is <code>true</code>, Brok returns
          Server-Sent Events. Clients should handle these canonical event names:
        </p>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Payload</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>status</code>
                </td>
                <td>
                  <code>{'{ "message": "Searching the web" }'}</code>
                </td>
                <td>High-level progress updates</td>
              </tr>
              <tr>
                <td>
                  <code>query</code>
                </td>
                <td>
                  <code>
                    {'{ "resolved_query": "...", "search_queries": [...] }'}
                  </code>
                </td>
                <td>Query rewriting and planned searches</td>
              </tr>
              <tr>
                <td>
                  <code>source</code>
                </td>
                <td>
                  <code>
                    {
                      '{ "source_id": "src_1", "citation_number": 1, "title": "...", "url": "..." }'
                    }
                  </code>
                </td>
                <td>A usable source was found</td>
              </tr>
              <tr>
                <td>
                  <code>citation</code>
                </td>
                <td>
                  <code>
                    {'{ "source_id": "src_1", "citation_number": 1 }'}
                  </code>
                </td>
                <td>Citation metadata for the answer</td>
              </tr>
              <tr>
                <td>
                  <code>answer_delta</code>
                </td>
                <td>
                  <code>{'{ "text": "Brok should..." }'}</code>
                </td>
                <td>Answer text as it is generated</td>
              </tr>
              <tr>
                <td>
                  <code>follow_ups</code>
                </td>
                <td>
                  <code>{'{ "items": [...] }'}</code>
                </td>
                <td>Suggested next questions</td>
              </tr>
              <tr>
                <td>
                  <code>done</code>
                </td>
                <td>
                  <code>{'{ "usage": {...} }'}</code>
                </td>
                <td>Terminal usage and completion event</td>
              </tr>
            </tbody>
          </table>
        </div>
        <pre className="bg-muted p-4 rounded-lg">
          <code>{`event: status
data: {"message":"Understanding your question"}

event: query
data: {"resolved_query":"Latest AI news","search_queries":["Latest AI news"]}

event: source
data: {"source_id":"src_1","citation_number":1,"title":"...","url":"..."}

event: answer_delta
data: {"text":"Recent AI development is..."}

event: follow_ups
data: {"items":[{"label":"Which source changed most recently?","query":"Which source changed most recently?"}]}

event: done
data: {"usage":{"total_tokens":215}}`}</code>
        </pre>

        <h2>Available Search Models</h2>
        <div className="space-y-4">
          {searchModels.map(model => (
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
              </div>
            </div>
          ))}
        </div>

        <h2>Use Cases</h2>
        <ul>
          <li>
            <strong>Research assistance</strong> - Deep search for comprehensive
            reports
          </li>
          <li>
            <strong>Fact-checking</strong> - Quick lite search for verification
          </li>
          <li>
            <strong>Content creation</strong> - Search-powered content with
            citations
          </li>
          <li>
            <strong>Customer support</strong> - Knowledge base augmented
            responses
          </li>
        </ul>

        <h2>Best Practices</h2>
        <ol>
          <li>Use lite search for simple factual queries</li>
          <li>Use deep search for research reports and analysis</li>
          <li>Always display citations for transparency</li>
          <li>Respect source freshness by checking published_date</li>
          <li>Handle rate limits gracefully</li>
        </ol>

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
                <td className="py-2 px-3">Invalid query or parameters</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">401</td>
                <td className="py-2 px-3">Invalid or missing API key</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">403</td>
                <td className="py-2 px-3">Model does not support search</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">429</td>
                <td className="py-2 px-3">Rate limit exceeded</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-mono">500</td>
                <td className="py-2 px-3">Search service error</td>
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
            <Link href="/docs/chat-completions">Chat Completions</Link> -
            Standard chat API
          </li>
          <li>
            <Link href="/docs/models">Models</Link> - All available models
          </li>
          <li>
            <Link href="/docs/rate-limits">Rate Limits</Link> - Understanding
            limits
          </li>
        </ul>
      </div>
    </div>
  )
}
