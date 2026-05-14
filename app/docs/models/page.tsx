import Link from 'next/link'

import { BROK_MODELS } from '@/lib/brok/models'

const MINIMAX_MODEL_IDS = [
  'MiniMax-M2.7',
  'MiniMax-M2.7-highspeed',
  'MiniMax-M2.5',
  'MiniMax-M2.5-highspeed',
  'MiniMax-M2.1',
  'MiniMax-M2.1-highspeed',
  'MiniMax-M2'
] as const

const BROK_MODEL_IDS = [
  'brok-code',
  'brok-search',
  'brok-search-pro',
  'brok-agent',
  'brok-lite',
  'brok-reasoning'
] as const

const speedNotes: Record<string, string> = {
  'MiniMax-M2.7': 'Standard path, about 60 tokens/sec',
  'MiniMax-M2.7-highspeed': 'Highspeed path, about 100 tokens/sec',
  'MiniMax-M2.5': 'Standard path, about 60 tokens/sec',
  'MiniMax-M2.5-highspeed': 'Highspeed path, about 100 tokens/sec',
  'MiniMax-M2.1': 'Standard path, about 60 tokens/sec',
  'MiniMax-M2.1-highspeed': 'Highspeed path, about 100 tokens/sec',
  'MiniMax-M2': 'Reasoning and agentic workload path'
}

const bestFor: Record<string, string> = {
  'MiniMax-M2.7':
    'Best default MiniMax model for complex coding, agent runs, and long-context work.',
  'MiniMax-M2.7-highspeed':
    'Use when response latency matters and you still want M2.7 quality.',
  'MiniMax-M2.5':
    'Strong value option for complex work with the current M2.5 capability set.',
  'MiniMax-M2.5-highspeed':
    'Use for M2.5 workloads that need faster streaming output.',
  'MiniMax-M2.1':
    'Good fit for multilingual programming and tool-heavy engineering flows.',
  'MiniMax-M2.1-highspeed':
    'Faster M2.1 path for interactive programming assistants.',
  'MiniMax-M2': 'Earlier M2 path for advanced reasoning and agentic tasks.'
}

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
  const minimaxModels = MINIMAX_MODEL_IDS.map(id => ({
    id,
    ...BROK_MODELS[id]
  }))
  const brokModels = BROK_MODEL_IDS.map(id => ({ id, ...BROK_MODELS[id] }))

  return (
    <div className="container max-w-5xl py-8">
      <div className="mb-8 max-w-3xl">
        <h1 className="mb-4 text-4xl font-bold">Models</h1>
        <p className="text-lg text-muted-foreground">
          Brok exposes the full MiniMax M2 family through OpenAI-compatible
          endpoints and provides opinionated Brok model aliases for coding,
          search, and agent workflows.
        </p>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Context window</p>
          <p className="mt-1 text-2xl font-semibold">204,800</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Shared across the MiniMax M2 text models.
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
          <div>
            <h2 className="text-2xl font-semibold">MiniMax M2 Models</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use these exact model IDs when you want the underlying MiniMax
              model directly.
            </p>
          </div>
          <Link
            href="/docs/chat-completions"
            className="text-sm font-medium text-primary hover:underline"
          >
            View API request format
          </Link>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b bg-muted/45 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium">Context</th>
                  <th className="px-4 py-3 font-medium">Speed</th>
                  <th className="px-4 py-3 font-medium">Capabilities</th>
                  <th className="px-4 py-3 font-medium">Best for</th>
                </tr>
              </thead>
              <tbody>
                {minimaxModels.map(model => (
                  <tr key={model.id} className="border-b last:border-b-0">
                    <td className="px-4 py-4 align-top">
                      <div className="font-medium">{model.name}</div>
                      <code className="mt-1 block text-xs text-muted-foreground">
                        {model.id}
                      </code>
                    </td>
                    <td className="px-4 py-4 align-top">
                      {formatTokens(model.contextWindow)}
                    </td>
                    <td className="px-4 py-4 align-top">
                      {speedNotes[model.id]}
                    </td>
                    <td className="px-4 py-4 align-top">
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
                    </td>
                    <td className="px-4 py-4 align-top text-muted-foreground">
                      {bestFor[model.id]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-2xl font-semibold">Brok Model Aliases</h2>
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
                  <dd>{model.providerModel}</dd>
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
              key, and choose any model ID above.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-foreground">
              Codex and Claude Code
            </h3>
            <p className="mt-1">
              Use <code>brok-code</code> as the default model so Brok&apos;s AI
              layer can route coding-agent requests to the right MiniMax path.
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
