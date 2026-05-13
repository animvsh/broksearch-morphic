# Brok Platform Master TODO

Last updated: 2026-05-13

## 1) Core Platform Stability

- [x] Merge Brok platform code into local `main` and install dependencies.
- [x] Keep app running locally on `127.0.0.1:3001`.
- [x] Add Brok surfaces: `BrokMail`, `BrokCode`, `Integrations`, `Discover`, `Library`, `Spaces`.
- [x] Re-run full route smoke after latest auth + integration changes.
- [ ] Resolve remaining runtime errors seen in browser console (clipboard/script warnings and any real blockers).

## 2) BrokCode Cloud + TUI

- [x] Build Lovable-style BrokCode page (chat + preview/visualizer split layout).
- [x] Add BrokCode TUI route with install/download docs and command references.
- [x] Add DeepSec `/securityscan` execution path in cloud + TUI command docs.
- [x] Add version history, cloud/tui sync session panel, and share-chat links.
- [x] Enforce Brok API key validation for BrokCode (`brok_sk_` only).
- [x] Enforce signed-in Brok account + API key ownership checks on BrokCode APIs.
- [x] Ensure generic "connect X" prompts in BrokCode chat open Composio flow for that integration.
- [x] Make BrokCode execute through Pi coding-agent as the primary runtime, with explicit failure instead of placeholder output when Pi is required.
- [ ] Verify GitHub connect -> repo context -> PR open flow end-to-end with real credentials.
- [ ] Verify BrokCode cloud and TUI sync end-to-end with same `BROKCODE_SESSION_ID`.

## 3) Brok Integrations (Composio)

- [x] Add Integrations page and toolkit connection table.
- [x] Add generic routes: `/api/integrations/[toolkit]/connect` and `/status`.
- [x] Require authenticated Brok user on generic integration routes (remove anonymous fallback IDs).
- [ ] Verify callback redirect UX always returns to Brok UI and confirms connected state.
- [ ] Verify Gmail + Google Calendar + GitHub + Linear connect status in real environment.

## 4) BrokMail

- [x] Add `/brokmail` product surface and initial UX shell.
- [ ] Complete real Gmail OAuth + Composio mailbox wiring (no mock data).
- [ ] Complete real Google Calendar Composio wiring for BrokMail calendar actions.
- [x] Route BrokMail chat, triage, summaries, and draft generation through Pi coding-agent instead of local demo heuristics.
- [ ] Verify chat-to-mail actions (search, summarize, draft, approval-gated send) against real tool calls.
- [x] Verify approvals and safety constraints for risky actions.

## 5) Docs, API, and Product Pages

- [x] Add BrokCode docs and TUI usage guidance.
- [x] Keep API keys and provider admin pages in place.
- [ ] Finish playground docs depth (downloads/instructions/details requested by user).
- [x] Verify "Brok API Playground" and "Brok Code" appear as separate sidebar destinations.
- [ ] Verify mobile responsiveness across core routes (`/`, `/playground`, `/brokcode`, `/brokmail`, `/integrations`).

## 6) Quality and Production Readiness

- [x] Run and pass `bun lint`.
- [x] Run and pass `bun typecheck`.
- [x] Run and pass `bun run build`.
- [x] Run browser walkthrough of critical flows and record pass/fail with concrete blockers.
- [x] Deploy to Railway and run post-deploy smoke checks (auth, integrations, BrokCode runs, BrokMail shell).

## Current Verification Notes

- Production URL: `https://brok-production.up.railway.app`
- Railway deployment verified: `63d0f4a0-47f0-442e-b2c5-9f3a930261e0`
- Production smoke passed after auth and integration changes.
- Production stress passed for chat/search APIs, BrokCode execution, usage/rate-limit enforcement, presentation CRUD/export, and protected UI routes.
- Production browser walkthrough confirmed `/brokmail` redirects to login for signed-out users instead of 404 and the disabled Google-login state no longer triggers the unsupported-provider error.
- Gmail and Google Calendar Composio auth configs are configured in production, but true signed-in OAuth completion still requires a real user session and provider popup completion.
- Local verification after Pi integration passed `bun lint`, `bun typecheck`, targeted BrokMail/Composio tests, and `bun run build`.
