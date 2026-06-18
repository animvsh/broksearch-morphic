# Scripts

This directory contains utility scripts for testing and development.

## chat-cli.ts

A command-line interface for testing the chat API without a browser client. This script allows you to interact with the chat API directly, making it easier to debug server-side issues and test API functionality.

## smoke-authenticated-platform.ts

Browser smoke harness for protected Brok product surfaces. It can run without
auth to verify clean redirects, or with an authenticated Playwright storage
state to prove the signed-in experience. When auth input is present, it also
runs a signed-in `/search?q=...&mode=quick` browser smoke that verifies
progress, answer, sources, follow-up UI, durable answer reload/URL state, and
browser fetch/page errors.

```bash
# Unauthenticated smoke, useful for checking login redirects and public routes
BROK_SMOKE_SCREENSHOTS=false bun run smoke:auth-platform

# Authenticated release gate
BROK_AUTH_STATE_PATH=/absolute/path/to/storage-state.json \
BROK_SMOKE_REQUIRE_AUTH=true \
bun run smoke:auth-platform
```

Optional credential mode is supported with `BROK_SMOKE_EMAIL` and
`BROK_SMOKE_PASSWORD`, but storage state is preferred so secrets are never
written into repo files. Tune the search probe with
`BROK_SMOKE_SEARCH_QUERY`, `BROK_SMOKE_SEARCH_MODE`, and
`BROK_SMOKE_SEARCH_TIMEOUT_MS`. Reports are written under `.brok-smoke/`.

## smoke-brokmail-composio.ts

Live BrokMail Composio gate for Gmail and Google Calendar. It requires an
authenticated Brok session and fails unless both connectors are
account-connected, execution-ready, and able to return Composio-backed route
payloads.

```bash
BROK_AUTH_STATE_PATH=/absolute/path/to/storage-state.json \
bun run smoke:brokmail:composio
```

Cookie mode is also supported with `BROKMAIL_SMOKE_COOKIE` or
`BROK_SMOKE_COOKIE`. Set `BROKMAIL_SMOKE_REQUIRE_RESULTS=true` when the smoke
account is expected to have at least one Gmail thread and one upcoming Calendar
event. Reports are written under `.brok-smoke/brokmail-composio/`.

## smoke-local-product.ts

Local whole-product smoke for the auth-disabled development path. It reuses a
reachable local server or starts `bun dev` itself with auth/access gates
disabled, then verifies the main search route, BrokCode, BrokMail, Playground,
API keys, Usage, and `GET /api/v1/models`.

```bash
# Self-managed local smoke on http://127.0.0.1:3000
bun run scripts/smoke-local-product.ts

# Reuse an already-running local server
BROK_LOCAL_SMOKE_START_SERVER=false \
BROK_LOCAL_SMOKE_BASE_URL=http://127.0.0.1:3001 \
bun run scripts/smoke-local-product.ts
```

The managed server path sets `ENABLE_AUTH=false`, `APP_ACCESS_GATE=false`,
`BROK_CLOUD_DEPLOYMENT=false`, and
`BROKCODE_ALLOW_LOCAL_BROWSER_SESSION_FALLBACK=true`. Reports are written under
`.brok-smoke/local-product/`.

## smoke-search-provider-outage.ts

Direct backend smoke for `/api/search/session` provider-outage behavior. It does
not intercept `window.fetch`; it posts to the real route, reads the SSE stream,
and verifies the answer completes with a clearly labeled local fallback, no
source events, and no citation events or markers.

```bash
bun run smoke:search-provider-outage
```

By default it starts a local production server on `http://127.0.0.1:3017` with
auth disabled, Brok provider keys blanked, search cache disabled, and a 1ms
provider timeout so the backend exercises the no-source outage path. Run
`bun run build` first if `.next/BUILD_ID` is missing. To use an already
configured outage target:

```bash
BROK_SEARCH_OUTAGE_SMOKE_START_SERVER=false \
SMOKE_BASE_URL=http://127.0.0.1:3001 \
bun run smoke:search-provider-outage
```

Set `BROK_SEARCH_OUTAGE_SMOKE_SERVER_COMMAND=dev` only when no other Next dev
server is running for this checkout.

## search-readiness.ts

Narrow Brok Search readiness harness for issue #118/#122 style checks. It can
run against `SMOKE_BASE_URL` or an already-running local dev server at
`http://127.0.0.1:3000`.

The default mode does not call paid/provider-backed search paths. It verifies:

- `GET /search/demo` loads as a public HTML page.
- `/api/v1/search/completions` rejects missing auth before search.
- `/api/v1/search/completions` rejects an invalid key when auth storage is
  available, or reports a clear skip when auth storage is unavailable.
- Provider-backed session/API runs are skipped with explicit reasons.

```bash
bun run smoke:search-readiness

SMOKE_BASE_URL=http://127.0.0.1:3001 \
bun run smoke:search-readiness
```

Opt into the product session SSE run only when the target is allowed to use real
search/LLM providers. The run posts a quick/lite query to
`/api/search/session`, then asserts the SSE contract, latency, source/citation
events, and follow-up events:

```bash
BROK_SEARCH_READINESS_RUN_SESSION=true \
BROK_SEARCH_READINESS_QUERY="What is Brok Search?" \
bun run smoke:search-readiness
```

For deployed/non-local targets, add
`BROK_SEARCH_READINESS_ALLOW_LIVE_PROVIDER=true`. For the API-key backed
`/api/v1/search/completions` success path, also set
`BROK_SEARCH_READINESS_RUN_API_COMPLETION=true` and
`BROK_SEARCH_READINESS_API_KEY`. Secret values are never printed.

## smoke-brokcode.ts

End-to-end BrokCode builder smoke harness. It creates a project, runs the code
builder stream, verifies generated files, opens the managed preview in
Playwright at desktop and mobile sizes, checks for blank/overflowing previews,
publishes a managed deployment URL, and exercises the TUI upload path.
Each run persists a timestamped eval JSON, a Markdown admin review, and
`latest.json` / `latest-admin-summary.md` under `.brok-smoke/brokcode/` so
release reviewers can see the pass rate, case evidence, and blockers without
reading terminal logs.

```bash
# Fast single-case builder smoke
bun run smoke:brokcode

# Generated-app acceptance matrix. This can be a partial release gate when TUI
# is explicitly out of scope.
bun run smoke:brokcode:matrix

# Run a subset of matrix cases
SMOKE_BROKCODE_MATRIX=true \
SMOKE_BROKCODE_CASES=landing-bakery,club-crud,mobile-study-planner \
bun run smoke:brokcode
```

The matrix covers landing page, dashboard, CRUD app, form workflow,
mobile-first utility, and backend-backed prototype prompts.

There are two distinct BrokCode gates:

1. Generated-app acceptance matrix: `SMOKE_BROKCODE_MATRIX=true`. This may set
   `SMOKE_BROKCODE_SKIP_TUI=true` only when the release explicitly excludes TUI
   readiness. Reports are marked `Status: partial` and `Launch gate: false`
   when TUI is skipped.
2. Full BrokCode launch acceptance: matrix plus TUI sync/preview/deploy smoke.
   This is the only path that can report `Status: passed` with
   `Launch gate: passed`.

For the default smoke path, set `SMOKE_SEED_TOKEN` (or `SMOKE_BROKCODE_API_KEY`) so
the harness can obtain a scoped `code:write` key automatically. When only
`SMOKE_BROKCODE_API_KEY=brok_sk_local_smoke` is used, the script exits with a
missing-scope error from the BrokCode execute endpoint.

```bash
SMOKE_BASE_URL=http://127.0.0.1:3001 \
SMOKE_SEED_TOKEN=... \
SMOKE_BROKCODE_SKIP_TUI=true \
bun run smoke:brokcode
```

For slower generated pages, tune preview navigation behavior:

```bash
SMOKE_BROKCODE_PREVIEW_WAIT_UNTIL=domcontentloaded \
SMOKE_BROKCODE_PREVIEW_NAV_TIMEOUT_MS=60000 \
bun run smoke:brokcode
```

Use `SMOKE_BROKCODE_PREVIEW_WAIT_UNTIL=networkidle` if you explicitly need a
quieter network idle boundary and the default timeout is adequate.

## stress-platform.ts

Production-readiness stress gate for API keys, route contracts, protected
tools, BrokCode, and BrokMail. It first checks unauthenticated API/build/mail
routes fail with the expected status, then seeds scoped API keys and verifies
chat/search/code execution, usage aggregation, missing scopes, paused/revoked
keys, daily limits, and RPM limits. Browser checks also render public
BrokCode/BrokMail docs and verify protected admin, usage, TUI, and mail
surfaces redirect to login when unauthenticated.

```bash
# Local or deployed target; defaults to http://127.0.0.1:3001
SMOKE_BASE_URL=https://your-brok-domain.com \
SMOKE_SEED_TOKEN="$SMOKE_SEED_TOKEN" \
bun run stress:platform
```

For route/browser contracts without DB seeding, use:

```bash
SMOKE_BASE_URL=https://your-brok-domain.com \
STRESS_PLATFORM_CONTRACTS_ONLY=true \
bun run stress:platform
```

For production deployments, prefer `SMOKE_SEED_TOKEN` so the script can seed
through `/api/admin/brok/smoke-seed` without direct database access. In local
development it can fall back to Drizzle or Supabase REST seeding when the
environment is configured. Set `STRESS_PLATFORM_BROWSER_TIMEOUT_MS` when cold
deployments or local dev compiles need a longer browser navigation timeout.

### Features

- Send messages to the chat API via command line
- Real-time Server-Sent Events (SSE) streaming output
- Configurable search modes (quick/adaptive) or disabled
- Chat session continuity
- Message regeneration support
- Secure authentication via environment variables
- URL validation for security (localhost only)

### Setup

1. **Add authentication to `.env.local`**:
   ```env
   MORPHIC_COOKIES="your-cookie-string-here"
   ```

### Usage

```bash
# Using npm script (recommended)
bun chat -m "Hello, how are you?"

# Direct usage
bun scripts/chat-cli.ts -m "Hello, how are you?"

# Disable search mode
bun chat -m "Tell me a joke" --no-search

# Use adaptive search mode for complex queries
bun chat -m "Research the latest AI developments" --search-mode adaptive

# Continue an existing chat
bun chat -c "chat_123" -m "Tell me more"

# Regenerate the last assistant message
bun chat -c "chat_123" -t regenerate --message-id "msg_456"

# Show help
bun chat --help
```

### Options

- `-m, --message <text>` - Message to send (default: "Hello, how are you?")
- `-u, --url <url>` - API URL (default: http://localhost:3000/api/chat, localhost only)
- `-c, --chat-id <id>` - Chat ID for session continuity (default: auto-generated)
- `-s, --search` - Enable search mode with adaptive strategy (default)
- `--no-search` - Disable search mode
- `--search-mode <type>` - Search strategy: `quick` or `adaptive`
- `-t, --trigger <type>` - Trigger type: `submit` (default) or `regenerate`
- `--message-id <id>` - Message ID (required for regenerate trigger)
- `-h, --help` - Show help message

### Output Format

The script displays:

- 🚀 Request details
- 🔍 Search mode status (quick/adaptive/disabled)
- 💬 Chat ID for reference
- Real-time AI responses with proper formatting
- 🔧 Tool usage (when search mode is enabled)
- ✅ Completion status

### Search Modes

- **quick**: Fast search with basic results
- **adaptive**: Intelligent search strategy based on query type, with enhanced support for complex queries (default)
- **disabled**: No search functionality (`--no-search`)

### Advanced Usage

#### Message Regeneration

You can regenerate the last assistant message in a conversation:

```bash
# First, send a message and note the chat ID and message ID from the output
bun chat -m "Tell me about AI"

# Then regenerate the assistant's response
bun chat -c "chat_123" -t regenerate --message-id "msg_456"

# Or edit the user message and regenerate
bun chat -c "chat_123" -t regenerate --message-id "msg_456" -m "Tell me about machine learning instead"
```

### Security Features

- **Authentication**: Uses environment variables only (no file-based auth)
- **URL Validation**: Only allows localhost and local network URLs
- **No Sensitive Logging**: Cookies are never displayed in logs
- **Input Sanitization**: Message length limited to 10,000 characters

### Requirements

- Bun runtime
- Local development server running (`bun dev`)
- Valid authentication cookies in `.env.local`

### Troubleshooting

#### Authentication Errors

If you encounter "User not authenticated" errors:

1. Ensure you're logged into Morphic in your browser
2. Get fresh cookies from DevTools
3. Update `MORPHIC_COOKIES` in `.env.local`
4. Cookies expire after ~1 hour, so refresh them if needed

#### API Errors

If you encounter "Selected provider is not enabled" errors:

1. Verify the selected model/provider is enabled in your local configuration
2. Check the required provider API key is set in `.env.local`
3. Retry with `--search-mode quick` to isolate search-specific issues

#### General Issues

- Check the development server is running: `bun dev`
- Verify `.env.local` exists and contains `MORPHIC_COOKIES`
- Use `DEBUG=1` prefix for verbose output
- Ensure the API URL is accessible (default: `http://localhost:3000/api/chat`)

#### Command Examples for Testing

```bash
# Test basic functionality
bun chat -m "Hello, test message" --no-search

# Test adaptive search
bun chat -m "Complex analysis task" --search-mode adaptive

# Debug mode
DEBUG=1 bun chat -m "Debug test"
```
