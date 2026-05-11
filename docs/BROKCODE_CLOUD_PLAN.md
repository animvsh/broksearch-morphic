# Brok Code Cloud Plan

## Goal

Brok Code is the Brok API-key-only coding agent product. It should work as:

- a cloud chat UI on Railway
- an OpenAI-compatible `brok-code` API model
- an Anthropic-compatible `/v1/messages` endpoint for Claude-style tools
- a local CLI/TUI
- a worktree-based repo editor
- a GitHub-connected PR workflow after user approval
- an Agent Skills-aware workflow with Brok-owned branding and terminal UX

## Compatibility Contract

Only Brok API keys are accepted by the Brok Code TUI and cloud API.

- Key env var: `BROK_API_KEY`
- Required key prefix: `brok_sk_`
- OpenAI-compatible base URL: `https://api.brok.ai/v1`
- Anthropic-compatible base URL: `https://api.brok.ai`
- Model: `brok-code`

## Implemented Now

- `/brokcode` chat-first UI with subagent inspection.
- Main app sidebar item named `Brok Code`.
- `brok-code` model metadata advertises code and tool support.
- `/api/v1/chat/completions` accepts coding-tool fields such as `tools`, `tool_choice`, `top_p`, and `max_completion_tokens`.
- `/api/v1/messages` provides Anthropic-style compatibility.
- `/api/v1/usage` reports Brok API usage for the key workspace.
- `npm run brokcode` launches the Brok Code TUI.
- The TUI supports streaming chat, usage stats, worktree creation, direct mode, GitHub mode guidance, and Agent Skills guidance.

## Cloud Runtime

Railway runs the same Next.js service and API routes:

- `bun run build`
- `bun run start`
- healthcheck: `/`
- required cloud env: `DATABASE_URL`, `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_API_BASE_URL`, `ENABLE_AUTH=true`

The cloud service should keep Brok Code under the same rate limits and usage events as the rest of Brok API.

## CLI / TUI Commands

- `/help`: show commands
- `/usage [day|week|month]`: fetch usage stats from `/v1/usage`
- `/worktree <branch>`: create an isolated git worktree
- `/direct`: explain direct repo edit mode
- `/github`: explain GitHub-connected mode
- `/compat`: print generic coding-agent compatibility env config using Brok API
- `/skills`: show Agent Skills / Superpowers setup
- `/model`: show active model and endpoint
- `/exit`: quit

## Next Production Hardening

- Persist Brok Code runs, subagent events, approvals, and repo sessions in Postgres.
- Add a Railway worker service for long-running agent execution.
- Add a GitHub connection table linked to Composio connected accounts.
- Add repository checkout/worktree orchestration with per-run sandbox directories.
- Stream real subagent events over SSE to `/brokcode`.
- Convert approval buttons into real action records.
- Add Brok-branded config export and Superpowers skill install helpers.
