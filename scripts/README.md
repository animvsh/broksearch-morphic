# Scripts

This directory contains utility scripts for testing and development.

## chat-cli.ts

A command-line interface for testing the chat API without a browser client. This script allows you to interact with the chat API directly, making it easier to debug server-side issues and test API functionality.

## smoke-authenticated-platform.ts

Browser smoke harness for protected Brok product surfaces. It can run without
auth to verify clean redirects, or with an authenticated Playwright storage
state to prove the signed-in experience.

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
written into repo files. Reports are written under `.brok-smoke/`.

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

# Full generated-app acceptance matrix
bun run smoke:brokcode:matrix

# Run a subset of matrix cases
SMOKE_BROKCODE_MATRIX=true \
SMOKE_BROKCODE_CASES=landing-bakery,club-crud,mobile-study-planner \
bun run smoke:brokcode
```

The matrix covers landing page, dashboard, CRUD app, form workflow,
mobile-first utility, and backend-backed prototype prompts. Set
`SMOKE_BROKCODE_SKIP_TUI=true` to skip the terminal smoke when the release gate
only needs generated-app coverage.

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
