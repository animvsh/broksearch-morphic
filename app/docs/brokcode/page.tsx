import Link from 'next/link'

export default function BrokCodeDocsPage() {
  return (
    <div className="container max-w-3xl py-8">
      <h1 className="mb-4 text-4xl font-bold">Brok Code</h1>
      <p className="mb-8 text-xl text-muted-foreground">
        Brok Code is the coding-agent surface for Brok: cloud chat with preview,
        terminal TUI sync, OpenAI-compatible API access, and Railway deployment.
      </p>

      <div className="prose prose-neutral dark:prose-invert">
        <h2>Cloud</h2>
        <p>
          Open <Link href="/brokcode">Brok Code Cloud</Link>, save a{' '}
          <code>brok_sk_</code> key, connect GitHub, then describe the app or
          repo change you want. The cloud view keeps chat on the left and live
          preview, subagents, session sync, usage, and deploy controls on the
          right.
        </p>

        <h2>Terminal TUI</h2>
        <p>
          The terminal version uses the same Brok API key and sync session ID as
          cloud, so terminal and browser work appear in one timeline.
        </p>

        <pre className="rounded-lg bg-muted p-4">
          <code>{`git clone <your-brok-platform-repo-url> brok
cd brok
npm install

export BROK_API_KEY="brok_sk_your_key"
export BROK_BASE_URL="https://your-brok-domain.com/api/v1"
export BROK_SYNC_URL="https://your-brok-domain.com"
export BROKCODE_SESSION_ID="default"

npm run brokcode`}</code>
        </pre>

        <h3>Local Development</h3>
        <pre className="rounded-lg bg-muted p-4">
          <code>{`npm run dev
export BROK_BASE_URL="http://127.0.0.1:3001/api/v1"
export BROK_SYNC_URL="http://127.0.0.1:3001"
BROK_API_KEY="brok_sk_local_smoke" npm run brokcode`}</code>
        </pre>

        <h2>Core Commands</h2>
        <ul>
          <li>
            <code>/help</code> - show available commands
          </li>
          <li>
            <code>/usage month</code> - show current usage stats
          </li>
          <li>
            <code>/sync</code> - fetch cloud and TUI session events
          </li>
          <li>
            <code>/worktree feature/my-branch</code> - create an isolated
            worktree
          </li>
          <li>
            <code>/securityscan</code> - bootstrap DeepSec if needed and run
            the repo security matcher scan
          </li>
          <li>
            <code>/securityscan process</code> - run DeepSec&apos;s AI
            investigation stage after a scan
          </li>
          <li>
            <code>/github</code> - review GitHub connection mode
          </li>
          <li>
            <code>/compat</code> - print Codex/OpenAI and Anthropic-compatible
            env setup
          </li>
        </ul>

        <h2>Compatible Coding Tools</h2>
        <pre className="rounded-lg bg-muted p-4">
          <code>{`# OpenAI-compatible tools such as Codex
export OPENAI_API_KEY="$BROK_API_KEY"
export OPENAI_BASE_URL="https://api.brok.ai/v1"
export OPENAI_MODEL="brok-code"

# Anthropic-compatible tools
export ANTHROPIC_API_KEY="$BROK_API_KEY"
export ANTHROPIC_BASE_URL="https://api.brok.ai"
export ANTHROPIC_MODEL="brok-code"`}</code>
        </pre>

        <h2>Deployment</h2>
        <p>
          Brok Code Cloud can trigger Railway deployments through either
          <code>BROKCODE_DEPLOY_WEBHOOK_URL</code> or{' '}
          <code>RAILWAY_API_TOKEN</code>. Deployment is explicit and
          approval-gated from the UI.
        </p>

        <h2>API Endpoints</h2>
        <ul>
          <li>
            <code>POST /api/brokcode/execute</code> - run a Brok Code command
            through brokcode-cloud/OpenCode or Brok runtime
          </li>
          <li>
            <code>POST /api/brokcode/execute</code> with{' '}
            <code>/securityscan</code> - run the DeepSec security scan workflow
            against the configured repo
          </li>
          <li>
            <code>POST /api/brokcode/deploy</code> - trigger configured Railway
            deployment
          </li>
          <li>
            <code>GET /api/brokcode/sessions</code> - list synced cloud/TUI/API
            sessions
          </li>
          <li>
            <code>POST /api/brokcode/sessions</code> - append synced session
            events
          </li>
        </ul>

        <h2>Next Steps</h2>
        <ul>
          <li>
            <Link href="/brokcode">Open Brok Code Cloud</Link>
          </li>
          <li>
            <Link href="/brokcode/tui">Open TUI Instructions</Link>
          </li>
          <li>
            <Link href="/playground">Test the Brok Playground</Link>
          </li>
        </ul>
      </div>
    </div>
  )
}
