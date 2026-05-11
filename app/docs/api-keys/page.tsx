import Link from 'next/link'

export default function ApiKeysPage() {
  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8 max-w-3xl">
        <h1 className="mb-4 text-4xl font-bold">API Keys</h1>
        <p className="text-lg text-muted-foreground">
          Brok API requests require a <code>brok_sk_</code> secret key. Use the
          same key for the playground, OpenAI-compatible clients, Codex, Claude
          Code-style tools, and Brok Code local or cloud sessions.
        </p>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Header</p>
          <code className="mt-2 block break-all text-sm">
            Authorization: Bearer brok_sk_...
          </code>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Default model</p>
          <code className="mt-2 block text-sm">brok-code</code>
          <p className="mt-2 text-xs text-muted-foreground">
            Recommended for AI coding layers and agent tools.
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Endpoint</p>
          <code className="mt-2 block break-all text-sm">
            https://api.brok.ai/v1
          </code>
        </div>
      </div>

      <div className="prose prose-neutral max-w-none dark:prose-invert">
        <h2>Key Format</h2>
        <p>
          Use secret keys only on trusted servers or local developer machines.
          The playground stores the key locally in the current browser so you
          can test requests quickly.
        </p>

        <ul>
          <li>
            <code>brok_sk_live_...</code> - live environment keys
          </li>
          <li>
            <code>brok_sk_test_...</code> - test environment keys
          </li>
        </ul>

        <h2>Creating Keys</h2>
        <p>
          Create API keys from the Brok dashboard. Each key can be configured
          with:
        </p>
        <ul>
          <li>Name and environment</li>
          <li>Allowed models</li>
          <li>Rate limits (RPM, daily)</li>
          <li>Monthly budget cap</li>
        </ul>

        <h2>OpenAI-Compatible Setup</h2>
        <pre className="rounded-lg bg-muted p-4">
          <code>{`export BROK_API_KEY="brok_sk_live_your_key_here"

export OPENAI_API_KEY="$BROK_API_KEY"
export OPENAI_BASE_URL="https://api.brok.ai/v1"
export OPENAI_MODEL="brok-code"`}</code>
        </pre>

        <h2>Claude Code-Compatible Setup</h2>
        <pre className="rounded-lg bg-muted p-4">
          <code>{`export BROK_API_KEY="brok_sk_live_your_key_here"

export ANTHROPIC_API_KEY="$BROK_API_KEY"
export ANTHROPIC_BASE_URL="https://api.brok.ai"
export ANTHROPIC_MODEL="brok-code"`}</code>
        </pre>

        <h2>Direct API Request</h2>
        <pre className="rounded-lg bg-muted p-4">
          <code>{`curl https://api.brok.ai/v1/chat/completions \\
  -H "Authorization: Bearer $BROK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "brok-code",
    "messages": [
      {"role": "user", "content": "Review this repo change and propose tests."}
    ],
    "stream": true
  }'`}</code>
        </pre>

        <h2>Brok Code Guidance</h2>
        <p>
          For AI app and coding-agent integrations, make Brok the default AI
          layer first. Use <code>brok-code</code> unless you deliberately need a
          direct MiniMax model ID such as <code>MiniMax-M2.7-highspeed</code>.
          This keeps Codex, Claude Code-style clients, the Brok playground, and
          Brok Code Cloud aligned on one API key and one model contract.
        </p>

        <h2>Key Security</h2>
        <div className="my-4 border-l-4 border-yellow-500 bg-yellow-50 p-4 dark:bg-yellow-950/30">
          <p className="text-yellow-800 dark:text-yellow-200">
            <strong>Important:</strong> Your API key is only shown once after
            creation. Store it securely.
          </p>
        </div>

        <h2>Download And Use</h2>
        <ul>
          <li>
            <Link href="/playground">Run a request in the API playground</Link>
          </li>
          <li>
            <Link href="/docs/models">Choose a Brok or MiniMax model</Link>
          </li>
          <li>
            <Link href="/docs/brokcode">Use Brok Code Cloud</Link>
          </li>
          <li>
            <Link href="/brokcode/tui">
              Open terminal TUI download and usage instructions
            </Link>
          </li>
        </ul>
      </div>
    </div>
  )
}
