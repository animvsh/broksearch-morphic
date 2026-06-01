# Deploying Brok to Railway (`brok.fyi`)

This repo is already wired for Railway in `railway.json` and `railway.toml`.
The remaining work for production is:

1. Point the production service to the correct Git branch / environment.
2. Set deployment env vars.
3. Ensure both `www.brok.fyi` and `docs.brok.fyi` DNS + TLS are set.
4. Validate the deployment with the production check script.

## Recommended production environment variables

Set these in Railway (Project → Settings → Variables):

- `NODE_ENV=production`
- `DATABASE_URL=...` (managed Postgres URL)
- `OPENAI_COMPATIBLE_API_KEY=...`
- `OPENAI_COMPATIBLE_API_BASE_URL=...`
- `TAVILY_API_KEY=...` (or your selected search provider)
- `ENABLE_AUTH=true`
- `NEXT_PUBLIC_SUPABASE_URL=...`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
- `ANONYMOUS_USER_ID=...` (if using anonymous fallback anywhere)
- `BROK_CLOUD_DEPLOYMENT=true`
- `NEXT_PUBLIC_APP_URL=https://www.brok.fyi`
- `NEXT_PUBLIC_BASE_URL=https://www.brok.fyi`
- `NEXT_PUBLIC_BROK_API_BASE_URL=https://www.brok.fyi/api/v1` (optional override for docs/examples)
- `BASE_URL=https://www.brok.fyi`
- `PORT=8080` (nixpacks/runtime)

### Optional but recommended

- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY` (if not using OpenAI-compatible provider only)
- Redis vars for rate limiting in production

## Domain mapping checklist

- `www.brok.fyi` → Railway app service
- `docs.brok.fyi` → your docs proxy to the same backend
- Cloudflare proxy upstream env var (recommended):
  - `BROK_UPSTREAM_ORIGIN=https://brok-production.up.railway.app`
  - set in both `cloudflare/brok-domain-proxy.ts` and `infra/cloudflare/docs-proxy-worker.js` as needed

## Build/deploy flow

Railway uses:

- `railway.json` for start command and migrations
- `railway.toml` for nixpacks/runtime vars

## Deployment verification

Run:

```bash
npm run check:railway-production
```

This checks:

- `/` resolves and renders
- `/api/v1/models` returns model list
- `/api/v1/usage` properly requires auth
- production routes like `/brokcode`, `/presentations`, `/integrations`
- docs route `/docs`

Set custom URLs when needed:

```bash
BROK_PROD_BASE_URL=https://www.brok.fyi \\
BROK_PROD_DOCS_URL=https://docs.brok.fyi \\
npm run check:railway-production
```

A report is written to:

- `.brok-audits/<timestamp>.json`
- `.brok-audits/railway-production-check-latest.json`
