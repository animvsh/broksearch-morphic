# Brok API, Usage, Billing, and Admin PRD

Last updated: 2026-05-19
Owner: Brok product and engineering
Status: Draft for Linear execution

## Summary

Brok API is the developer platform behind Brok search, chat, code, and usage tracking. It includes API keys, OpenAI-compatible routes, search completions, Anthropic-compatible messages, usage dashboards, billing limits, and admin controls.

## Current Implementation Anchors

- API key pages: `app/api-keys/*`
- Playground: `app/playground/page.tsx`
- Docs: `app/docs/*`
- Usage dashboard: `app/usage/page.tsx`
- Billing dashboard: `app/billing/page.tsx`
- Admin dashboard: `app/admin/brok/page.tsx`
- Admin logs/API keys/providers: `app/admin/brok/*`
- OpenAI chat: `app/api/v1/chat/completions/route.ts`
- Anthropic messages: `app/api/v1/messages/route.ts`
- Search completions: `app/api/v1/search/completions/route.ts`
- Models: `app/api/v1/models/route.ts`
- Usage: `app/api/v1/usage/route.ts`
- Auth/rate/usage core: `lib/brok/*`, `lib/actions/api-keys.ts`, `lib/actions/admin-brok.ts`

## Target Users

- Developer integrating Brok API.
- BrokCode user consuming `brok-code`.
- Admin monitoring cost, usage, providers, abuse, and allowlist.

## Product Goal

Make Brok feel like a real API platform: create keys, test in playground, read docs, enforce limits, track spend, and administer production traffic.

## Requirements

### API Keys

- Users can create test/live keys with scopes, allowed models, RPM, daily request limit, and monthly budget.
- Keys are shown once and stored hashed.
- Users can pause, resume, and revoke their own keys.
- Browser BrokCode should not require users to paste keys; account ownership handles browser access.

### API Routes

- `/api/v1/chat/completions` supports OpenAI-compatible chat and optional web search tool requests.
- `/api/v1/search/completions` supports lite, standard, and deep search depths with citations and streaming events.
- `/api/v1/messages` supports Anthropic-style code messages.
- `/api/v1/models` returns model metadata, search/code/tool support, context, and pricing.
- `/api/v1/usage` returns period usage for keys with `usage:read`.

### Usage and Billing

- Usage ledger records endpoint, model, provider, surface, runtime, session, tokens, search queries, pages fetched, tool calls, cost, latency, and status.
- Usage page shows 30-day requests, tokens, cost, errors, active keys, daily chart, endpoint mix, key breakdown, and recent events.
- Billing page shows plan, workspace budget, key budgets, enforced controls, and current spend.
- Budget and rate-limit enforcement must match the controls shown in UI.

### Admin

- Admin dashboard shows Brok platform health, BrokCode usage, key activity, cost telemetry, provider split, model split, latency, failures, and private app allowlist.
- Admin can allow/revoke emails for gated Brok access.
- Admin logs must filter by endpoint, model, status, workspace, and date.
- Provider routing should show configured provider status and model mapping.

### Docs and Playground

- Playground is branded `BrokCode API`.
- Docs include quickstart, API keys, chat completions, search completions, BrokCode, models, rate limits, errors, and security.
- Snippets must be copy-ready and match real route behavior.
- Search and chat docs must explain streaming events and auth scopes.

## Acceptance Criteria

- A signed-in user can create a key and call chat, search, models, and usage routes.
- Scope enforcement rejects missing scopes with clear errors.
- RPM, daily request, and monthly budget limits are enforced and logged.
- Usage dashboard updates after API calls.
- Admin dashboard shows real usage and allowlist data.
- Playground can stream a request using a valid key.
- Docs route examples match current API behavior.

## Non-Goals

- Stripe checkout is not required for the current phase unless explicitly scheduled.
- Browser copilot.
- Public self-serve signup without the allowlist gate.

## Launch Checklist

- `bun lint`, `bun typecheck`, `bun run build`, and `bun run test` pass.
- API smoke tests pass with a real or smoke-seeded key.
- Admin allowlist verified in production.
- Usage and billing charts verified after generated traffic.
