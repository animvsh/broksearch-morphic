# Brok API Platform Sample Apps

This directory is safe for coding agents to inspect and run. It contains
dependency-free sample apps that use Brok as the API layer.

## Environment

Agents must read credentials from the environment only:

```bash
export BROK_BASE_URL="https://www.brok.fyi"
export BROK_API_KEY="brok_sk_your_key"
```

Never write real API keys to files, logs, commits, issues, or screenshots.

## App Commands

```bash
node examples/api-platform/apps/research-brief.mjs "What changed in AI coding agents this week?"
node examples/api-platform/apps/support-triage.mjs examples/api-platform/apps/sample-support-ticket.json
node examples/api-platform/apps/agent-task-runner.mjs "Draft a release checklist for an API integration"
node examples/api-platform/apps/agent-task-runner.mjs --file examples/api-platform/apps/kery-integration-task.md
```

## Verification Commands

Static checks:

```bash
bun run check:api-examples
```

Live checks with a valid key:

```bash
BROK_BASE_URL="https://www.brok.fyi" BROK_API_KEY="$BROK_API_KEY" \
  bun run check:api-examples -- --live
```

## Agent Contract

- Treat `BROK_BASE_URL` as the API host.
- Treat `BROK_API_KEY` as secret material.
- Use `/api/v1/models` to prove auth and discover model aliases.
- Use `/api/v1/search/completions` for grounded web answers.
- Use `/api/v1/chat/completions` for synthesis, triage, and app logic.
- Keep outputs short enough for smoke tests to run quickly.
