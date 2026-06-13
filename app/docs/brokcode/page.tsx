import Link from 'next/link'

export default function BrokCodeDocsPage() {
  return (
    <div className="container max-w-3xl py-8">
      <h1 className="mb-4 text-4xl font-bold">Brok Code</h1>
      <p className="mb-8 text-xl text-muted-foreground">
        Brok Code is the coding-agent surface for Brok: brokcode-cloud chat with
        preview, terminal TUI sync, Brok API model access, GitHub PRs, Composio
        connection prompts, security scans, and explicit deploy controls.
      </p>

      <div className="prose prose-neutral dark:prose-invert">
        <h2>Brok Code Cloud</h2>
        <p>
          Open <Link href="/brokcode">Brok Code Cloud</Link>, save a{' '}
          <code>brok_sk_</code> key, connect GitHub, then describe the app or
          repo change you want. The cloud view keeps chat, live preview,
          execution status, Cloud/TUI sync, usage, version history, GitHub PR,
          Composio integration, and deploy controls in one workspace.
        </p>

        <h2>Terminal TUI Download And Run</h2>
        <p>
          The TUI is shipped from this repository as{' '}
          <code>scripts/brokcode-tui.mjs</code>. There is no separate binary
          download advertised in this app yet; clone the Brok repository,
          install dependencies, and run the script through{' '}
          <code>bun run brokcode</code>. The terminal version uses the same Brok
          API key and sync session ID as cloud, so terminal and browser work
          appear in one timeline.
        </p>

        <pre className="rounded-lg bg-muted p-4">
          <code>{`git clone <your-brok-platform-repo-url> brok
cd brok
bun install

export BROK_API_KEY="brok_sk_your_key"
export BROK_BASE_URL="https://your-brok-domain.com/api/v1"
export BROK_SYNC_URL="https://your-brok-domain.com"
export BROKCODE_SESSION_ID="default"

bun run brokcode`}</code>
        </pre>

        <h3>Local Development Run</h3>
        <pre className="rounded-lg bg-muted p-4">
          <code>{`bun dev --hostname 127.0.0.1 --port 3001
export BROK_BASE_URL="http://127.0.0.1:3001/api/v1"
export BROK_SYNC_URL="http://127.0.0.1:3001"
export BROKCODE_SESSION_ID="default"
export BROK_API_KEY="brok_sk_..."
bun run brokcode`}</code>
        </pre>

        <h2>Cloud/TUI Sync</h2>
        <p>
          Use the same <code>BROKCODE_SESSION_ID</code> in Brok Code Cloud and
          in the terminal. In cloud, save the session in Runtime setup and press
          Sync. In the TUI, run <code>/sync</code> to pull the shared session
          log from <code>/api/brokcode/sessions</code>.
        </p>

        <h2>Saved Projects And Files</h2>
        <p>
          Brok Code projects store generated app files against your Brok account
          instead of leaving work trapped in one chat transcript. The TUI can
          create a project, select it, list its files, and push local files into
          the managed project store. Use a real <code>brok_sk_</code> key; these
          commands call the same account-owned project APIs as Brok Code Cloud.
        </p>

        <pre className="rounded-lg bg-muted p-4">
          <code>{`/project new Contract Genie --username contract-genie
/projects
/project select contract-genie
/file put app/page.tsx ./app/page.tsx
/files`}</code>
        </pre>

        <h2>Core Commands</h2>
        <ul>
          <li>
            <code>/help</code> - show all available commands
          </li>
          <li>
            <code>/doctor</code> - diagnose config, key, and connectivity
          </li>
          <li>
            <code>/usage [day|week|month]</code> - show usage stats
          </li>
          <li>
            <code>/sync</code> - fetch cloud and TUI session events
          </li>
          <li>
            <code>/session [id]</code> - show the active shared session id and
            sync origin
          </li>
          <li>
            <code>/projects</code> - list saved Brok Code projects
          </li>
          <li>
            <code>/project new &lt;name&gt; [--username handle]</code> - create
            and select a project
          </li>
          <li>
            <code>/project select &lt;id|slug&gt;</code> - select a project
          </li>
          <li>
            <code>/project show</code> - print the active project
          </li>
          <li>
            <code>/project rename &lt;name&gt;</code> - rename the active
            project
          </li>
          <li>
            <code>/project delete</code> - delete the active project (with
            confirmation)
          </li>
          <li>
            <code>/files</code> - list files in the selected project
          </li>
          <li>
            <code>/file put &lt;path&gt; &lt;local&gt;</code> - save a local
            file into the selected project
          </li>
          <li>
            <code>/file show &lt;path&gt;</code> - print a saved file
          </li>
          <li>
            <code>/file rename &lt;old&gt; &lt;new&gt;</code> - rename a saved
            file
          </li>
          <li>
            <code>/file delete &lt;path&gt;</code> - remove a file from the
            project
          </li>
          <li>
            <code>/versions [limit]</code> - list recent version history
          </li>
          <li>
            <code>/version &lt;id&gt;</code> - show one version&apos;s metadata
            and files
          </li>
          <li>
            <code>/resume [taskId]</code> - reconnect to a streaming task
          </li>
          <li>
            <code>/worktree feature/my-branch</code> - create an isolated Git
            worktree under <code>.brokcode-worktrees</code>
          </li>
          <li>
            <code>/securityscan</code> - bootstrap DeepSec if needed and run the
            repo security matcher scan
          </li>
          <li>
            <code>/securityscan process</code> - run DeepSec&apos;s AI
            investigation stage after a scan
          </li>
          <li>
            <code>/github</code> - review GitHub connection mode through
            Composio and Brok Code Cloud
          </li>
          <li>
            <code>/compat</code> - print Codex/OpenAI and Anthropic-compatible
            env setup
          </li>
          <li>
            <code>/key brok_sk_...</code> - save a Brok API key to{' '}
            <code>~/.brokcode/config.json</code>
          </li>
          <li>
            <code>/key clear</code> - remove the saved key
          </li>
        </ul>

        <h3>TUI Input Shortcuts</h3>
        <ul>
          <li>
            <code>Tab</code> - autocomplete slash commands and project ids
          </li>
          <li>
            <code>↑</code> / <code>↓</code> - recall previous commands from{' '}
            <code>~/.brokcode/history</code>
          </li>
          <li>
            <code>Ctrl+C</code> - cancel the in-flight stream; press twice to
            exit
          </li>
        </ul>

        <h2>Local Terminal Harness</h2>
        <p>
          The TUI also operates as a terminal-native coding harness, sending
          every operation through the Brok API. Use it to work against your
          local repository without leaving the terminal.
        </p>
        <ul>
          <li>
            <code>/read &lt;path&gt;</code> - read a local file with line
            numbers
          </li>
          <li>
            <code>/head &lt;path&gt; &lt;n&gt;</code> - first n lines of a local
            file
          </li>
          <li>
            <code>/tail &lt;path&gt; &lt;n&gt;</code> - last n lines of a local
            file
          </li>
          <li>
            <code>/shell &lt;cmd&gt;</code> - run a shell command from cwd
            (refuses destructive patterns like <code>rm -rf /</code>,{' '}
            <code>sudo</code>, <code>mkfs</code>)
          </li>
          <li>
            <code>/git status|diff|log|branch|show</code> - read-only git
            introspection
          </li>
          <li>
            <code>/build &lt;prompt&gt;</code> - one-shot: send a build prompt
            to the active project and stream the result
          </li>
          <li>
            <code>/ask &lt;file&gt; &lt;question&gt;</code> - load a local file
            and ask Brok a question about it
          </li>
          <li>
            <code>/edit &lt;file&gt; &lt;instruction&gt;</code> - load a local
            file, ask Brok to rewrite, save the result back to the local file
          </li>
        </ul>

        <h2>GitHub PRs And Worktrees</h2>
        <p>
          In Brok Code Cloud, use Connect GitHub to open the Composio
          authorization prompt. After GitHub is connected, set repository, base,
          and head branch in Runtime setup, then use Open PR. In the TUI, use{' '}
          <code>/worktree feature/name</code> before branch work when you want
          an isolated checkout.
        </p>

        <h2>Composio Connection Prompts</h2>
        <p>
          Brok Code Cloud detects connection intent for GitHub, Supabase, Gmail,
          Google Calendar, Linear, Slack, Notion, Vercel, and Railway. Prompts
          such as <code>connect GitHub</code> or <code>connect Railway</code>{' '}
          open the matching Composio authorization flow when the backend is
          configured. If Composio is not configured, the UI shows that state
          instead of pretending the connection exists.
        </p>

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

        <h2>1-Click Deploy</h2>
        <p>
          Brok Code Cloud includes a one-click deploy button. It triggers the
          configured deployment path through either{' '}
          <code>BROKCODE_DEPLOY_WEBHOOK_URL</code> or{' '}
          <code>RAILWAY_API_TOKEN</code>. If neither is configured, the deploy
          endpoint returns a configuration error rather than showing an
          unsupported success state.
        </p>

        <h2>API Endpoints</h2>
        <ul>
          <li>
            <code>POST /api/brokcode/execute</code> - run a Brok Code command
            through brokcode-cloud or the Brok runtime
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
            <code>GET /api/brokcode/projects</code> - list account-owned
            BrokCode projects
          </li>
          <li>
            <code>POST /api/brokcode/projects</code> - create a saved project
            with optional username
          </li>
          <li>
            <code>GET /api/brokcode/projects/[id]</code> - read a single project
          </li>
          <li>
            <code>PATCH /api/brokcode/projects/[id]</code> - rename a saved
            project
          </li>
          <li>
            <code>DELETE /api/brokcode/projects/[id]</code> - delete a saved
            project and its files
          </li>
          <li>
            <code>GET /api/brokcode/projects/[id]/backend</code> - read redacted
            project backend metadata
          </li>
          <li>
            <code>PUT /api/brokcode/projects/[id]/backend</code> - link, rotate,
            or clear an encrypted InsForge backend connection
          </li>
          <li>
            <code>POST /api/brokcode/projects/[id]/backend/health</code> - check
            InsForge backend reachability
          </li>
          <li>
            <code>POST /api/brokcode/projects/insforge/provision</code> - create
            one InsForge trial backend for the selected project
          </li>
          <li>
            <code>GET /api/brokcode/projects/[id]/files</code> - list files for
            one saved project
          </li>
          <li>
            <code>PUT /api/brokcode/projects/[id]/files</code> - upsert a saved
            project file
          </li>
          <li>
            <code>POST /api/brokcode/projects/[id]/files</code> - apply a batch
            of file operations (delete, rename, upsert)
          </li>
          <li>
            <code>GET /api/brokcode/versions</code> - list version history
          </li>
          <li>
            <code>GET /api/brokcode/versions/[id]</code> - read one version
          </li>
          <li>
            <code>POST /api/brokcode/github/connect</code> - open the Composio
            GitHub authorization prompt
          </li>
          <li>
            <code>POST /api/brokcode/github/pull-request</code> - create a
            GitHub pull request from the selected repository, base, and head
            branch
          </li>
          <li>
            <code>POST /api/integrations/[toolkit]/connect</code> - open a
            Composio prompt for supported toolkits
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
            <Link href="/api-platform/playground">Test the BrokCode API</Link>
          </li>
        </ul>
      </div>
    </div>
  )
}
