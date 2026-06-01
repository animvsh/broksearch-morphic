import Link from 'next/link'

import { BROK_MODELS } from '@/lib/brok/models'

const BROK_MODEL_IDS = [
  'brok-fast',
  'brok-code',
  'brok-search',
  'brok-search-pro',
  'brok-agent',
  'brok-lite',
  'brok-reasoning'
] as const

function formatTokens(value?: number) {
  return value?.toLocaleString('en-US') ?? '204,800'
}

function capabilityBadges(model: {
  supportsSearch: boolean
  supportsTools: boolean
  supportsStreaming: boolean
  supportsCode?: boolean
}): string[] {
  return [
    model.supportsStreaming && 'Streaming',
    model.supportsTools && 'Tools',
    model.supportsSearch && 'Search',
    model.supportsCode && 'Code'
  ].filter((capability): capability is string => Boolean(capability))
}

export default function ModelsPage() {
  const brokModels = BROK_MODEL_IDS.map(id => ({ id, ...BROK_MODELS[id] }))

  return (
    <div className="container max-w-5xl py-8">
      <div className="mb-8 max-w-3xl">
        <h1 className="mb-4 text-4xl font-bold">Models</h1>
        <p className="text-lg text-muted-foreground">
          Brok exposes opinionated model aliases for coding, search, and agent
          workflows through OpenAI-compatible endpoints. Pick the alias that
          matches the job and let Brok route the request to the right underlying
          model.
        </p>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Context window</p>
          <p className="mt-1 text-2xl font-semibold">204,800</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Shared across Brok text models.
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Compatibility</p>
          <p className="mt-1 text-2xl font-semibold">OpenAI API</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use <code>/v1/chat/completions</code> with bearer auth.
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Default AI layer</p>
          <p className="mt-1 text-2xl font-semibold">brok-code</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Recommended for Codex, Claude Code, and agentic coding tools.
          </p>
        </div>
      </div>

      <section className="mb-10">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-2xl font-semibold">Brok Model Aliases</h2>
          <Link
            href="/docs/chat-completions"
            className="text-sm font-medium text-primary hover:underline"
          >
            View API request format
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {brokModels.map(model => (
            <div key={model.id} className="rounded-lg border p-5">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{model.name}</h3>
                  <code className="text-xs text-muted-foreground">
                    {model.id}
                  </code>
                </div>
                <div className="text-sm sm:text-right">
                  <div>${model.inputCostPerMillion}/1M input</div>
                  <div className="text-muted-foreground">
                    ${model.outputCostPerMillion}/1M output
                  </div>
                </div>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">
                {model.description}
              </p>
              <dl className="mb-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Provider</dt>
                  <dd>Brok</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Context</dt>
                  <dd>{formatTokens(model.contextWindow)}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-1.5">
                {capabilityBadges(model).map(capability => (
                  <span
                    key={capability}
                    className="rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                  >
                    {capability}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-muted/25 p-5">
        <h2 className="text-xl font-semibold">Setup Guidance</h2>
        <div className="mt-3 grid gap-4 text-sm text-muted-foreground md:grid-cols-3">
          <div>
            <h3 className="font-medium text-foreground">
              OpenAI-compatible API
            </h3>
            <p className="mt-1">
              Set <code>OPENAI_BASE_URL</code> to{' '}
              <code>https://api.brok.ai/v1</code>, pass a <code>brok_sk_</code>{' '}
              key, and choose any Brok alias above.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-foreground">
              Codex and Claude Code
            </h3>
            <p className="mt-1">
              Use <code>brok-code</code> as the default model so Brok&apos;s AI
              layer can route coding-agent requests to the right path.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-foreground">Download and use</h3>
            <p className="mt-1">
              Start in <Link href="/playground">BrokCode API</Link>, then follow{' '}
              <Link href="/docs/brokcode">Brok Code</Link> or{' '}
              <Link href="/brokcode/tui">TUI instructions</Link> for local
              terminal use.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href="/docs/api-keys" className="font-medium text-primary">
            API key requirements
          </Link>
          <Link
            href="/docs/chat-completions"
            className="font-medium text-primary"
          >
            Chat completions
          </Link>
          <Link
            href="/docs/search-completions"
            className="font-medium text-primary"
          >
            Search completions
          </Link>
        </div>
      </section>
    </div>
  )
}
