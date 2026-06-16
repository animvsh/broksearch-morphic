# Deploying Brok to Railway (`brok.fyi`)

This repo is already wired for Railway in `railway.json` and `railway.toml`.
The remaining work for production is:

1. Point the production service to the correct Git branch / environment.
2. Set deployment env vars.
3. Ensure both `www.brok.fyi` and `docs.brok.fyi` DNS + TLS are set.
4. Validate the deployment with the production check script.

For the current API-platform blocker handoff, also follow
[`docs/api-platform-launch-blockers.md`](../api-platform-launch-blockers.md).

## Recommended production environment variables

Set these in Railway (Project → Settings → Variables):

- `NODE_ENV=production`
- `DATABASE_URL=...` (managed Postgres URL)
- `DATABASE_RESTRICTED_URL=...` (restricted app-user URL for RLS-backed app access)
- `API_KEY_SALT=...` (required when `BROK_CLOUD_DEPLOYMENT=true`)
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
- `SMOKE_SEED_TOKEN=...` (required for seeded production smoke/stress)

### Optional but recommended

- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY` (if not using OpenAI-compatible provider only)
- `COMPOSIO_API_KEY` for BrokMail execution
- `COMPOSIO_GMAIL_TOOLKIT_SLUGS=gmail,googlesuper`
- `COMPOSIO_GCAL_TOOLKIT_SLUGS=googlecalendar,googlesuper`
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

Before pushing deploy changes, scan the repository for committed secret-looking
values:

```bash
bun run scan:secrets
bun run scan:secrets:local
```

The scanner intentionally prints only file names, line numbers, and rule names.
Use `scan:secrets:local` during rotation incidents to include ignored local env
files without printing matched values. If it flags a real value, rotate that
value in the provider dashboard, replace the committed text with a placeholder,
and redeploy with the replacement stored only in
Railway/Vercel/Supabase/provider secret storage.

## Deployment verification

Before running live route checks, confirm the deployment target has the required
environment variable names without printing secret values:

```bash
bun run check:deploy-env -- --provider railway --environment production
bun run check:deploy-env -- --provider vercel --environment production
```

The readiness checker reports only variable names as present or missing. It does
not echo raw values from Railway, Vercel, or local `.env` files. If Vercel has no
environment variables configured, this check should fail with the full missing
required-name list; add those names in Vercel Project Settings and redeploy.

Run:

```bash
bun run check:railway-production
```

This checks:

- `/` resolves and renders
- `/features` resolves and renders
- `/pricing` resolves and renders
- `/api/v1/models` returns model list
- `/api/v1/usage` properly requires auth
- production routes like `/brokcode`, `/presentations`, `/integrations`
- newer BrokCode, BrokMail, and build-plan auth/input contracts
- BrokCode and BrokMail public docs on the app host
- BrokMail public docs on the docs host
- smoke-seed endpoint is either hidden or auth-gated
- docs route `/docs`

Set custom URLs when needed:

```bash
BROK_PROD_BASE_URL=https://www.brok.fyi \\
BROK_PROD_DOCS_URL=https://docs.brok.fyi \\
bun run check:railway-production
```

For full seeded proof against the deployed app, set `SMOKE_SEED_TOKEN` in the
deployment and local shell, then run:

```bash
SMOKE_BASE_URL=https://www.brok.fyi \\
STRESS_PLATFORM_CONTRACTS_ONLY=true \\
bun run stress:platform

SMOKE_BASE_URL=https://www.brok.fyi \\
SMOKE_SEED_TOKEN="$SMOKE_SEED_TOKEN" \\
bun run smoke:platform

SMOKE_BASE_URL=https://www.brok.fyi \\
SMOKE_SEED_TOKEN="$SMOKE_SEED_TOKEN" \\
bun run stress:platform
```

The same proof is available as the GitHub Actions workflow
`API Platform Production Proof`. Configure the repository secret
`SMOKE_SEED_TOKEN`, then run the workflow manually with the production base URL
or let the scheduled run verify `https://www.brok.fyi`. The workflow fails
explicitly when the seed token is absent so release proof cannot silently degrade
to contract-only coverage.

A report is written to:

- `.brok-audits/<timestamp>.json`
- `.brok-audits/railway-production-check-latest.json`
