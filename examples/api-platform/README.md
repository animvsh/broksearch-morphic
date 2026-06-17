# Brok API Platform Examples

Small dependency-free starters for building against the Brok API. They call:

- `GET /api/v1/models`
- `POST /api/v1/chat/completions`
- `POST /api/v1/search/completions`

## Environment

Use shell exports for local testing:

```bash
export BROK_BASE_URL="https://www.brok.fyi"
export BROK_API_KEY="brok_sk_your_key"
```

For local development against a running app, use:

```bash
export BROK_BASE_URL="http://localhost:3000"
```

Do not commit real API keys. The checked-in `.env.example` only shows variable names and a placeholder. If you create a local env file, keep it outside source control or name it `.env.local` at the repository root, which is already ignored.

## Node

Requires Node 18 or newer for built-in `fetch`.

```bash
node examples/api-platform/node/client.mjs
```

## Python

Uses only the Python standard library.

```bash
python3 examples/api-platform/python/client.py
```

## Sample Apps

These are small app-shaped examples that agents can run while building against
the Brok API.

### Research Brief

Uses `GET /api/v1/models`, `POST /api/v1/search/completions`, and
`POST /api/v1/chat/completions` to research a question and synthesize a compact
developer brief.

```bash
node examples/api-platform/apps/research-brief.mjs "What should a public API launch checklist include?"
```

### Support Triage

Reads a support ticket JSON file and uses chat completions to classify the issue,
draft a customer reply, and list internal next steps.

```bash
node examples/api-platform/apps/support-triage.mjs examples/api-platform/apps/sample-support-ticket.json
```

### Agent Task Runner

Runs a generic coding-agent-style task against `brok-code`.

```bash
node examples/api-platform/apps/agent-task-runner.mjs "Draft a release checklist for an API integration"
```

You can also run an agent-oriented real-repo task using the checked-in Kery
context fixture:

```bash
node examples/api-platform/apps/agent-task-runner.mjs --file examples/api-platform/apps/kery-integration-task.md
```

## Agent Access

Agents should start with:

- `examples/api-platform/AGENTS.md` for operating rules.
- `examples/api-platform/agent-manifest.json` for machine-readable commands,
  env vars, and expected verification commands.

The contract is intentionally simple: read `BROK_BASE_URL` and `BROK_API_KEY`
from the environment, never print secrets, run one sample command, and report
the returned `requestId` plus any machine-readable error code.

## Verification

Static verification:

```bash
bun run check:api-examples
```

Live verification with a valid key:

```bash
BROK_BASE_URL="https://www.brok.fyi" BROK_API_KEY="$BROK_API_KEY" \
  bun run check:api-examples -- --live
```

In a trusted operator environment that has `SMOKE_SEED_TOKEN`, the live checker
can seed a temporary scoped key automatically:

```bash
BROK_BASE_URL="https://www.brok.fyi" bun run check:api-examples -- --live
```

## Expected Output

The clients and sample apps print the configured base URL or app name, model
count, response request IDs when present, and short response previews.

If you see `missing BROK_API_KEY`, export a real key in your shell first. If you see a 401 or 403, the key is missing, invalid, expired, or lacks the needed `chat:write` or `search:write` scope.
