# Brok Platform Master TODO

Last updated: 2026-05-10

## 1) Core Platform Stability

- [x] Merge Brok platform code into local `main` and install dependencies.
- [x] Keep app running locally on `127.0.0.1:3001`.
- [x] Add Brok surfaces: `BrokMail`, `BrokCode`, `Integrations`, `Discover`, `Library`, `Spaces`.
- [ ] Re-run full route smoke after latest auth + integration changes.
- [ ] Resolve remaining runtime errors seen in browser console (clipboard/script warnings and any real blockers).

## 2) BrokCode Cloud + TUI

- [x] Build Lovable-style BrokCode page (chat + preview/visualizer split layout).
- [x] Add BrokCode TUI route with install/download docs and command references.
- [x] Add DeepSec `/securityscan` execution path in cloud + TUI command docs.
- [x] Add version history, cloud/tui sync session panel, and share-chat links.
- [x] Enforce Brok API key validation for BrokCode (`brok_sk_` only).
- [x] Enforce signed-in Brok account + API key ownership checks on BrokCode APIs.
- [ ] Ensure generic "connect X" prompts in BrokCode chat open Composio flow for that integration.
- [ ] Verify GitHub connect -> repo context -> PR open flow end-to-end with real credentials.
- [ ] Verify BrokCode cloud and TUI sync end-to-end with same `BROKCODE_SESSION_ID`.

## 3) Brok Integrations (Composio)

- [x] Add Integrations page and toolkit connection table.
- [x] Add generic routes: `/api/integrations/[toolkit]/connect` and `/status`.
- [ ] Require authenticated Brok user on generic integration routes (remove anonymous fallback IDs).
- [ ] Verify callback redirect UX always returns to Brok UI and confirms connected state.
- [ ] Verify Gmail + Google Calendar + GitHub + Linear connect status in real environment.

## 4) BrokMail

- [x] Add `/brokmail` product surface and initial UX shell.
- [ ] Complete real Gmail OAuth + Composio mailbox wiring (no mock data).
- [ ] Complete real Google Calendar Composio wiring for BrokMail calendar actions.
- [ ] Verify chat-to-mail actions (search, summarize, draft, approval-gated send) against real tool calls.
- [ ] Verify approvals and safety constraints for risky actions.

## 5) Docs, API, and Product Pages

- [x] Add BrokCode docs and TUI usage guidance.
- [x] Keep API keys and provider admin pages in place.
- [ ] Finish playground docs depth (downloads/instructions/details requested by user).
- [ ] Verify "Brok API Playground" and "Brok Code" appear as separate sidebar destinations.
- [ ] Verify mobile responsiveness across core routes (`/`, `/playground`, `/brokcode`, `/brokmail`, `/integrations`).

## 6) Quality and Production Readiness

- [ ] Run and pass `npm run lint`.
- [ ] Run and pass `npm run typecheck`.
- [ ] Run and pass `npm run build`.
- [ ] Run browser walkthrough of critical flows and record pass/fail with concrete blockers.
- [ ] Deploy to Railway and run post-deploy smoke checks (auth, integrations, BrokCode runs, BrokMail shell).
