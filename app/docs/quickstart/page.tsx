import Link from 'next/link'

import { CopyButton } from '@/components/copy-button'

const setupCommand = `export BROK_BASE_URL="https://www.brok.fyi"
export BROK_API_KEY="brok_sk_test_replace_me"`

const modelsCommand = `curl "$BROK_BASE_URL/api/v1/models" \\
  -H "Authorization: Bearer $BROK_API_KEY"`

const chatCommand = `curl "$BROK_BASE_URL/api/v1/chat/completions" \\
  -i \\
  -H "Authorization: Bearer $BROK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "brok-code",
    "messages": [
      {
        "role": "user",
        "content": "Explain this TypeScript error and propose the smallest safe patch."
      }
    ],
    "temperature": 0.2,
    "max_tokens": 500
  }'`

const searchCommand = `curl "$BROK_BASE_URL/api/v1/search/completions" \\
  -H "Authorization: Bearer $BROK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "brok-search",
    "query": "What should I verify before shipping a public API integration?",
    "search_depth": "standard",
    "stream": false
  }'`

const streamCommand = `curl -N "$BROK_BASE_URL/api/v1/search/completions" \\
  -H "Authorization: Bearer $BROK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "brok-search",
    "query": "Give me a concise API launch checklist with citations.",
    "stream": true
  }'`

const usageCommand = `curl "$BROK_BASE_URL/api/v1/usage" \\
  -H "Authorization: Bearer $BROK_API_KEY"`

const nodeExample = `const baseUrl = process.env.BROK_BASE_URL ?? 'https://www.brok.fyi'

const response = await fetch(\`\${baseUrl}/api/v1/chat/completions\`, {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${process.env.BROK_API_KEY}\`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'brok-code',
    messages: [
      {
        role: 'user',
        content: 'Write a small release checklist for an API client.'
      }
    ]
  })
})

console.log('request id', response.headers.get('x-request-id'))
console.log(await response.json())`

const pythonExample = `import os
import requests

base_url = os.getenv("BROK_BASE_URL", "https://www.brok.fyi")

response = requests.post(
    f"{base_url}/api/v1/chat/completions",
    headers={
        "Authorization": f"Bearer {os.environ['BROK_API_KEY']}",
        "Content-Type": "application/json",
    },
    json={
        "model": "brok-code",
        "messages": [
            {
                "role": "user",
                "content": "Write a small release checklist for an API client.",
            }
        ],
    },
    timeout=60,
)

print("request id", response.headers.get("x-request-id"))
print(response.json())`

const pageContent = `# Brok API Quickstart

${setupCommand}

## List models

${modelsCommand}

## Chat

${chatCommand}

## Search

${searchCommand}

## Stream search events

${streamCommand}

## Inspect usage

${usageCommand}

## Node

${nodeExample}

## Python

${pythonExample}`

export default function QuickstartPage() {
  return (
    <div className="container max-w-5xl py-8">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl">
          <p className="mb-2 text-sm font-medium text-muted-foreground">
            5-minute path from key to first useful response
          </p>
          <h1 className="mb-4 text-4xl font-bold">Brok API Quickstart</h1>
          <p className="text-xl text-muted-foreground">
            Create a key, call models, chat, search, stream events, inspect
            usage, and clean up without pasting secrets into browser storage or
            source code.
          </p>
        </div>
        <CopyButton content={pageContent} />
      </div>

      <section className="mb-8 grid gap-4 md:grid-cols-3">
        <QuickCard
          title="1. Create a key"
          body="Use a test key first. Secret keys are only shown once, so store them in your local shell or server secret manager."
          href="/docs/api-keys"
          linkLabel="API key guide"
        />
        <QuickCard
          title="2. Make calls"
          body="Use Bearer auth, keep request IDs from response headers, and start with brok-code or brok-search."
          href="/docs/api-reference"
          linkLabel="API reference"
        />
        <QuickCard
          title="3. Verify usage"
          body="Check usage and logs after real calls, then revoke or rotate keys you no longer need."
          href="/api-platform/usage"
          linkLabel="Usage dashboard"
        />
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-8">
          <Step
            number="1"
            title="Set your local environment"
            description="Use a test key for the quickstart. Do not commit this value, paste it into Linear/GitHub, or store it in browser localStorage."
            code={setupCommand}
          />

          <Step
            number="2"
            title="List models"
            description="This confirms your key is valid and shows which model aliases your integration can use."
            code={modelsCommand}
          />

          <Step
            number="3"
            title="Call chat completions"
            description="Use the OpenAI-compatible chat route for coding agents, app assistants, and normal message workflows. The -i flag prints response headers so you can capture x-request-id."
            code={chatCommand}
          />

          <Step
            number="4"
            title="Call search completions"
            description="Search completions return answer text with citations, follow-up questions, query planning metadata, and usage."
            code={searchCommand}
          />

          <Step
            number="5"
            title="Stream events"
            description="Use -N so curl prints Server-Sent Events as they arrive. Handle status, query, source, citation, answer_delta, follow_ups, and done events."
            code={streamCommand}
          />

          <Step
            number="6"
            title="Inspect usage"
            description="Call usage after real requests to verify metering and freshness. Keep the x-request-id from earlier calls when debugging mismatches."
            code={usageCommand}
          />

          <section className="rounded-lg border p-5">
            <h2 className="mb-3 text-2xl font-semibold">Use Node or Python</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              The raw HTTP API works from any backend. Keep secrets server-side
              and log request IDs with your own job or user ID.
            </p>
            <div className="grid gap-4">
              <CodeBlock title="Node / TypeScript" code={nodeExample} />
              <CodeBlock title="Python" code={pythonExample} />
            </div>
          </section>

          <section className="rounded-lg border p-5">
            <h2 className="mb-3 text-2xl font-semibold">Clean up</h2>
            <div className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2">
              <div>
                <h3 className="font-medium text-foreground">
                  Rotate or revoke
                </h3>
                <p className="mt-1">
                  Revoke temporary keys after a smoke test. Rotate any key that
                  was pasted into chat, issue trackers, terminal logs, or a
                  browser field.
                </p>
              </div>
              <div>
                <h3 className="font-medium text-foreground">
                  Inspect logs and limits
                </h3>
                <p className="mt-1">
                  Check usage, request IDs, rate-limit headers, model access,
                  and budget limits before promoting a key to production.
                </p>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border p-4">
            <h2 className="mb-3 text-base font-semibold">Expected Shape</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <code>id</code>, <code>object</code>, and <code>model</code>
              </li>
              <li>
                <code>choices[0].message.content</code> for non-streaming chat
              </li>
              <li>
                <code>citations</code> and <code>follow_ups</code> for search
              </li>
              <li>
                <code>usage</code> for metering and cost analysis
              </li>
            </ul>
          </div>

          <div className="rounded-lg border p-4">
            <h2 className="mb-3 text-base font-semibold">Production Checks</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>Store keys only in server-side secrets.</li>
              <li>
                Log <code>x-request-id</code> for every API call.
              </li>
              <li>Handle 401, 403, 429, 500, and 503 responses.</li>
              <li>Use backoff on retryable failures.</li>
              <li>Set budgets before live traffic.</li>
            </ul>
          </div>

          <div className="rounded-lg border p-4">
            <h2 className="mb-3 text-base font-semibold">Next Docs</h2>
            <div className="grid gap-2 text-sm">
              <Link href="/docs/api-reference" className="text-primary">
                API Reference
              </Link>
              <Link href="/api/openapi" className="text-primary">
                OpenAPI JSON
              </Link>
              <Link href="/docs/errors" className="text-primary">
                Error Handling
              </Link>
              <Link href="/docs/rate-limits" className="text-primary">
                Rate Limits
              </Link>
              <Link href="/docs/security" className="text-primary">
                Security
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function QuickCard({
  title,
  body,
  href,
  linkLabel
}: {
  title: string
  body: string
  href: string
  linkLabel: string
}) {
  return (
    <div className="rounded-lg border p-4">
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      <p className="mb-3 text-sm text-muted-foreground">{body}</p>
      <Link href={href} className="text-sm font-medium text-primary">
        {linkLabel}
      </Link>
    </div>
  )
}

function Step({
  number,
  title,
  description,
  code
}: {
  number: string
  title: string
  description: string
  code: string
}) {
  return (
    <section className="rounded-lg border p-5">
      <div className="mb-4 flex gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
          {number}
        </span>
        <div>
          <h2 className="text-2xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <CodeBlock code={code} />
    </section>
  )
}

function CodeBlock({ title, code }: { title?: string; code: string }) {
  return (
    <div>
      {title ? <h3 className="mb-2 text-base font-semibold">{title}</h3> : null}
      <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs">
        <code>{code}</code>
      </pre>
    </div>
  )
}
