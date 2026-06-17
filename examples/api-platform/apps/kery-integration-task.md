Kery repo context from https://github.com/Kery-HQ/Kery

Kery is an open-source AI web-app testing platform. It crawls an app, plans
test flows, drives a real Playwright browser, and reports visual, functional,
and UX bugs with screenshots and bounding boxes.

Repository shape:

- Root workspace package: `kery-oss`
- Workspaces: `packages/*`, `apps/*`
- Apps:
  - `apps/api`: Fastify API server.
  - `apps/web`: React dashboard.
  - `apps/worker`: test run executor.
- Packages:
  - `packages/engine`: agent loop, LLM clients, crawler, memory, triage.
  - `packages/db`: PostgreSQL storage adapter and migrations.
  - `packages/client`: TypeScript HTTP client SDK.
  - `packages/kery`: setup CLI published as `keryai`.
  - `packages/mcp`: MCP server published as `@keryai/mcp`.

Current provider positioning:

- Kery supports OpenRouter, OpenAI, Anthropic, and Google Gemini.
- Model envs include `AGENT_MODEL`, `AUXILIARY_MODEL`, and
  `REVIEW_AGENT_MODEL`.
- Kery runs multiple agent roles: Navigator, Review Agent, Filmstrip Reviewer,
  Triage Agent, and auxiliary planning/summarization.

Task:

As a coding agent, create a concise integration smoke plan for using Brok API as
an AI provider inside Kery. Include:

1. The environment variables to add.
2. The package areas likely to change.
3. The first implementation seam.
4. A three-step verification plan.
5. Risks or follow-up checks.
