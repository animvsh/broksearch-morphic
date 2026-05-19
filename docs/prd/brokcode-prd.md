# BrokCode PRD

Last updated: 2026-05-19
Owner: Brok product and engineering
Status: Draft for Linear execution

## Summary

BrokCode is Brok's coding-agent product. It must work as a Lovable-style cloud builder, a Brok API model, and a local TUI. The browser experience should be simple: chat on the left, live preview on the right, with project files, deploys, GitHub actions, and usage controls available without cluttering the main path.

## Product Goal

Let a user describe an app, watch BrokCode build it in the cloud, preview it live, iterate through chat, deploy it to a Brok/Railway-hosted URL, and optionally create GitHub changes after approval. It should not feel like a demo shell.

## Current Implementation Anchors

- Cloud page: `app/brokcode/page.tsx`
- Browser app UI: `components/brokcode/brokcode-app.tsx`
- TUI docs page: `app/brokcode/tui/page.tsx`
- API docs: `app/docs/brokcode/page.tsx`
- TUI script: `scripts/brokcode-tui.mjs`
- Execute route: `app/api/brokcode/execute/route.ts`
- Deploy route: `app/api/brokcode/deploy/route.ts`
- Projects/files routes: `app/api/brokcode/projects/*`
- GitHub routes: `app/api/brokcode/github/*`
- Session sync: `app/api/brokcode/sessions/route.ts`
- Versions: `app/api/brokcode/versions/route.ts`
- Key vault: `app/api/brokcode/key/route.ts`

## Target Users

- Non-technical builder who wants Lovable-style app generation.
- Developer who wants cloud coding-agent execution with previews and PRs.
- Power user who wants a local TUI connected to the same BrokCode session.

## Primary Jobs

1. Create a full app from a prompt.
2. Iterate on UI and behavior through chat.
3. Inspect generated files and versions.
4. Preview the running app with hot reload.
5. Deploy with one click to a stable URL.
6. Connect GitHub and open a PR after approval.
7. Continue a session from the TUI or browser.

## Requirements

### Browser Builder

- Default layout is chat-left and preview-right.
- The prompt composer must support normal build requests, targeted edits, and integration commands.
- The preview panel must show live app status, deployed URL, and failure details.
- Project files must be accessible, but not dominate the main workspace.
- The UI must expose run checks, open PR, deploy, share, and connect integrations as clear actions.
- The user should not need to paste an API key in the browser; Brok account ownership should handle browser access.

### Runtime

- Primary runtime is Pi coding-agent when configured.
- If Pi is required but unavailable, BrokCode must fail explicitly with actionable text.
- Runs must record steps: queued, context load, generation, build, preview, checks, deploy, done/error.
- Long runs must continue as background tasks if the tab closes.
- Runtime events should stream to the browser and be persisted for session history.

### Project System

- Projects must have a durable ID, owner, title, generated files, latest version, preview URL, deploy URL, and updated timestamp.
- File tree must support read and upsert through account-owned routes.
- Versions must preserve prompt, runtime, result, preview URL, branch, commit SHA, and PR URL.
- Shared sessions must be portable and safe to view without leaking secrets.

### Preview and Deploy

- Preview must support hot reload for generated apps.
- Browser preview should prefer the active cloud preview URL, then latest deploy URL.
- One-click deploy should create or update a Railway-backed project deployment.
- Deploys should support Brok-owned subdomains and later custom username/subdomain routing.
- Deploy route is currently admin-only until per-project deploy targets are configured; production requires per-project deploy authorization.

### GitHub

- GitHub connection uses Composio popup flow.
- Repo context must detect repository, remote URL, current branch, default branch, and commit SHA.
- Opening a PR must be approval-gated and should never silently write to GitHub.
- GitHub actions should be visible in session history and usage logs.

### TUI

- `npm run brokcode` launches the local TUI.
- The TUI supports `/help`, `/usage`, `/worktree`, `/direct`, `/github`, `/compat`, `/skills`, `/model`, and `/exit`.
- TUI sessions must sync with cloud when `BROKCODE_SESSION_ID` and base URL are configured.
- TUI must accept Brok API keys only and validate `brok_sk_` prefix.
- Stored keys must stay in local config and never be logged.

### API Model

- `brok-code` is available through OpenAI-compatible `/api/v1/chat/completions`.
- Anthropic-compatible `/api/v1/messages` supports code workflows.
- Usage is recorded to the same Brok usage ledger as other API activity.
- Scope and model enforcement must use the Brok API key system.

## Acceptance Criteria

- A signed-in allowlisted user can open `/brokcode` without entering an API key.
- User prompt creates a project record, generated files, an execution run, and a preview status.
- Preview URL loads or shows a precise runtime error.
- The same session appears in cloud and TUI sync views.
- TUI `/usage month` fetches `/api/v1/usage`.
- A GitHub-connected user can load repo context and open a PR only after approval.
- Deploy creates a reachable deployment URL and stores it on the project/version.
- Usage dashboards show BrokCode endpoint, runtime, tokens, cost, and failures.

## Non-Goals

- Chrome/browser copilot.
- Unapproved writes to GitHub.
- Requiring user-provided API keys inside the browser builder.

## Launch Checklist

- End-to-end browser build from prompt verified.
- Hot preview verified after an edit.
- One-click deploy verified on Railway or configured cloud target.
- TUI sync verified with the same session ID.
- GitHub connect, repo context, and PR flow verified with real credentials.
- Desktop and mobile UI pass browser QA.
