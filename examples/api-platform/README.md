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

## Expected Output

Both examples print the configured base URL, model count, response request IDs when present, and short previews of the chat and search responses.

If you see `missing BROK_API_KEY`, export a real key in your shell first. If you see a 401 or 403, the key is missing, invalid, expired, or lacks the needed `chat:write` or `search:write` scope.
