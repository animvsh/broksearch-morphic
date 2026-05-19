import Link from 'next/link'

export default function BrokCodeApiDocsPage() {
  return (
    <div className="container max-w-3xl py-8">
      <h1 className="mb-4 text-4xl font-bold">BrokCode API</h1>
      <p className="mb-8 text-xl text-muted-foreground">
        BrokCode exposes coding-agent behavior through Brok API-compatible
        endpoints. Browser users use account auth; external tools use scoped
        <code className="mx-1">brok_sk_</code> keys.
      </p>

      <div className="prose prose-neutral dark:prose-invert">
        <h2>Core endpoints</h2>
        <ul>
          <li>
            <code>POST /api/brokcode/execute</code> runs a BrokCode command,
            streams status events, records usage, and saves generated files when
            a project is selected.
          </li>
          <li>
            <code>GET /api/v1/models</code> lists available chat, search, and
            code models.
          </li>
          <li>
            <code>POST /api/v1/chat/completions</code> runs OpenAI-compatible
            chat.
          </li>
          <li>
            <code>POST /api/v1/messages</code> runs Anthropic-compatible
            messages.
          </li>
          <li>
            <code>POST /api/v1/search/completions</code> runs search-backed
            completions.
          </li>
          <li>
            <code>GET /api/v1/usage</code> returns usage for the authenticated
            key.
          </li>
        </ul>

        <h2>BrokCode execute request</h2>
        <pre className="rounded-lg bg-muted p-4">
          <code>{`curl https://www.brok.fyi/api/brokcode/execute \\
  -H "Authorization: Bearer $BROK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "command": "Create a simple CRM dashboard",
    "model": "brok-code",
    "source": "tui",
    "session_id": "default",
    "project_id": "project_...",
    "stream": true
  }'`}</code>
        </pre>

        <h2>Projects and files</h2>
        <p>
          Select a project before running a build. BrokCode saves generated
          files to the account-owned project file store and exposes a managed
          preview URL for the active project.
        </p>
        <ul>
          <li>
            <code>GET /api/brokcode/projects</code> lists projects.
          </li>
          <li>
            <code>POST /api/brokcode/projects</code> creates a project.
          </li>
          <li>
            <code>GET /api/brokcode/projects/[id]/files</code> lists files.
          </li>
          <li>
            <code>PUT /api/brokcode/projects/[id]/files</code> upserts a file.
          </li>
          <li>
            <code>POST /api/brokcode/projects/[id]/preview</code> refreshes the
            managed preview.
          </li>
        </ul>

        <h2>Scopes</h2>
        <p>
          API keys need <code>code:write</code> for BrokCode execution and
          <code>usage:read</code> for usage reads. Browser BrokCode does not ask
          users to paste API keys.
        </p>

        <h2>Next steps</h2>
        <ul>
          <li>
            <Link href="/docs/brokcode">Use BrokCode Cloud and TUI</Link>
          </li>
          <li>
            <Link href="/docs/insforge">Configure InsForge</Link>
          </li>
          <li>
            <Link href="/playground">Open BrokCode API playground</Link>
          </li>
        </ul>
      </div>
    </div>
  )
}
