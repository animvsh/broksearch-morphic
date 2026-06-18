# Brok Builder Completion Plan

Status: active coordinator checklist
Scope: `/build`, BrokCode cloud builder, runtime preview, persistence, backend wiring, and publish/deploy proof.

This plan defines what "100% complete" means for the Brok Builder lane. Local green tests are necessary, but they are not sufficient for launch readiness when a requirement depends on real provider credentials, database persistence, InsForge, GitHub, or cloud deploy targets.

## Operating Model

- Managed worker threads own scoped implementation lanes.
- The coordinator thread integrates worker output, reconciles latest `main`, runs verification, and prepares merge readiness.
- Do not merge or push from this worktree without coordinator review.
- Do not claim production readiness from stubbed browser smokes alone.

## Completion Requirements

| Area                  | Required Proof                                                                                             | Current Evidence                                                                                                                                     | Status                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Project creation      | Prompt creates a durable BrokCode project with owner/workspace identity.                                   | `/api/build/stream` and BrokCode route tests cover project creation and stale project failure.                                                       | Local proof complete; DB-backed production proof pending.                    |
| Prompt-to-app         | `/build` can plan and stream an app through actual local APIs.                                             | Stubbed browser smoke passes; `SMOKE_BUILD_REQUIRE_BROKCODE=true bun run smoke:build:real` verifies actual local APIs and rejects degraded fallback. | Local gate added; live provider run blocked by current credential rejection. |
| No-fallback runtime   | A no-fallback BrokCode/Pi/provider run generates files and fails closed when unavailable.                  | Unit coverage exists; live credential proof missing.                                                                                                 | Blocked on provider/runtime env.                                             |
| Preview               | Generated app preview loads, handles mobile, and shows precise failure states.                             | Browser smokes pass; file edits now clear stale previews when `index.html` is invalid.                                                               | Local proof complete.                                                        |
| File edits            | Saved edits persist, refresh preview metadata, and reset publish readiness.                                | Route and UI tests cover save/load and stale-preview clearing.                                                                                       | Local proof complete; DB-backed proof pending.                               |
| Persistence           | Projects/files/history survive real DB-backed process/session boundaries.                                  | File/local storage tests pass; dev server used inert placeholder DB.                                                                                 | Blocked on real `DATABASE_URL`.                                              |
| Managed publish       | One-click managed publish snapshots files and serves immutable public app URLs.                            | Browser smoke and route tests pass for managed publish/snapshot behavior.                                                                            | Local proof complete.                                                        |
| External cloud deploy | One-click deploy triggers configured webhook or Railway target and records deployment evidence.            | Route tests mock webhook/Railway.                                                                                                                    | Blocked on live deploy env.                                                  |
| InsForge backend      | Backend provision/apply/context/rewire works with live InsForge and generated app uses only public config. | Backend context/apply tests exist; no current live env proof.                                                                                        | Blocked on InsForge env.                                                     |
| Access gating         | Browser access uses account ownership; API keys require `code:write`; cloud fails closed.                  | Route/unit tests pass.                                                                                                                               | Local proof complete.                                                        |
| GitHub handoff        | Repo context and PR creation work only after explicit approval.                                            | Routes exist; not verified in this lane.                                                                                                             | Pending real credentials.                                                    |
| TUI sync              | Browser and TUI share session/project state with `BROKCODE_SESSION_ID`.                                    | BrokCode smoke can exercise TUI path when configured.                                                                                                | Pending real launch smoke.                                                   |
| Responsive UI         | Desktop and mobile builder surfaces avoid overflow and keep controls reachable.                            | `/build` and `/brokcode` browser smokes pass.                                                                                                        | Local proof complete.                                                        |
| Merge readiness       | Dirty worktree reconciled with latest `morphic/main`; no overlapping semantic regressions.                 | Current branch is zero commits behind `morphic/main` and one commit ahead on draft PR #217.                                                          | Pending coordinator merge review and CI/Vercel completion.                   |

## Required Live Inputs For 100%

- `DATABASE_URL` and required migration state for real project/file/session persistence.
- BrokCode provider/runtime credentials such as Pi/OpenCode-compatible configuration.
- `SMOKE_SEED_TOKEN` or a real scoped `code:write` Brok API key for seeded smoke runs.
- InsForge project/provisioning credentials for backend context/apply/rewire proof.
- `BROKCODE_DEPLOY_WEBHOOK_URL` or Railway deploy credentials for external cloud deploy proof.
- GitHub/Composio credentials for repo context and approval-gated PR proof.

For local proof without Postgres, run the dev server with `ENABLE_AUTH=false`, `APP_ACCESS_GATE=false`, `BROKCODE_PROJECT_STORAGE=file`, `BROKCODE_ALLOW_LOCAL_AUTH_FALLBACK=true`, and `BROKCODE_ALLOW_LOCAL_BROWSER_SESSION_FALLBACK=true`. This only proves the file-backed local path; production readiness still requires DB-backed proof.

## Final Launch Gate

The builder lane reaches 100% only when all of these pass against the current merged code:

1. `bun format:check`
2. `bun lint`
3. `bun typecheck`
4. `bun run build`
5. `bun run test`
6. `bun run smoke:build:browser`
7. `bun run smoke:brokcode:browser`
8. `bun run check:brok-builder -- --require-live`
9. `SMOKE_BUILD_REQUIRE_BROKCODE=true bun run smoke:build:real`
10. `bun run smoke:brokcode` with seeded `code:write` credentials and no degraded fallback.
11. InsForge backend apply/context/rewire smoke against live backend.
12. External webhook or Railway deploy proof with reachable deployment URL.
13. GitHub context and approval-gated PR proof.

Any missing live input should be reported as a named blocker, not converted into a passing local-only claim.
