# Brok API Platform Launch Blockers

This is the handoff checklist for the remaining external work after the repo
blocker pass. Keep secret values in provider dashboards and secret stores only;
do not paste them into Linear, docs, commits, terminal output, or chat.

## Current External Blockers

| Linear  | Owner surface                                        | Required proof                                                                                                              |
| ------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| BRO-163 | Provider dashboards and local operator env           | Rotate every value flagged by `bun run scan:secrets:local`, then rerun it and confirm no live-looking local secrets remain. |
| BRO-165 | Railway/Vercel/Supabase/provider secret stores       | Confirm required production env names and rotated values exist, then redeploy the production app.                           |
| BRO-168 | Production database and seeded API traffic           | Apply the usage-ledger migrations and run seeded smoke/stress so usage reservations finalize under live traffic.            |
| BRO-182 | GitHub Actions repository secrets and production app | Add `SMOKE_SEED_TOKEN`, run `API Platform Production Proof`, and attach the passing run to release notes.                   |

## Repo-Side Evidence Matrix

| Linear  | Repo-side status | Evidence                                                                                                                                                                                                                                                                                                |
| ------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BRO-156 | Implemented      | `docs/openapi/brok-v1.openapi.json` publishes the public v1 contract, `/api/openapi` serves it, and `bun run check:openapi` verifies expected public paths, bearer auth, request IDs, reusable errors, response schemas, and SSE extensions.                                                            |
| BRO-163 | Implemented      | `scripts/scan-secrets.ts` and `scripts/secret-scan-core.ts` scan committed/staged/local env surfaces without printing secret values; CI runs `bun run scan:secrets -- --tracked`; this checklist documents the rotation incident response and prohibits copying secret values into issue trackers/docs. |
| BRO-164 | Implemented      | `components/playground/chat-playground.tsx` no longer accepts browser-supplied API keys, `/api/playground/run` resolves an account-owned server session key, and `bun run check:api-platform-launch` now guards against playground key placeholders, `apiKey:` request bodies, and storage writes.      |
| BRO-165 | Implemented      | `.env.local.example`, `docs/CONFIGURATION.md`, and `docs/deployment/railway-to-brok-fyi.md` document required env names; `bun run check:deploy-env -- --provider local --env-file .env.local.example` passes; CI includes the Deploy Env Names gate.                                                    |
| BRO-168 | Implemented      | `lib/brok/usage-tracker.ts` provides fail-closed `recordUsage`, preflight `reserveUsage`, finalization, and stale reservation expiry; API/chat/search/messages/BrokCode routes call it; `scripts/reconcile-usage-reservations.ts` provides the reconciliation command.                                  |
| BRO-182 | Implemented      | `.github/workflows/api-platform-production-proof.yml` runs public contract stress, requires `SMOKE_SEED_TOKEN`, then runs seeded smoke and stress; `bun run check:api-platform-launch -- --require-external` validates the required seeded-proof inputs without printing values.                        |
| BRO-188 | Done             | BrokCode streaming execution reserves usage before runtime work, finalizes success/error outcomes, fails closed in cloud when reservation creation fails, and has stale reservation reconciliation coverage in `lib/brok/__tests__/usage-tracker.test.ts`.                                              |

The launch checker also guards the BrokCode browser UI itself:
`components/brokcode/brokcode-app.tsx` must not collect API keys, read legacy
stored API keys, persist API keys, or hold saved key metadata in React state.
Old `brok_code_api_key` browser storage is deleted rather than migrated through
the client.

## Current PR/CI Caveat

PR #143 is the repo-side blocker implementation branch. GitHub Actions may show
red checks even when no job ran. Check the failed job annotations: if they say
`The job was not started because your account is locked due to a billing issue`,
the failure is account-level and must be cleared in GitHub billing before CI can
execute. Do not treat that as proof that lint/typecheck/tests ran and failed.

## Required Operator Sequence

0. Confirm the repo-side launch blocker artifacts are present:

   ```bash
   bun run check:api-platform-launch
   ```

   After production secrets are configured, run the external-input mode:

   ```bash
   SMOKE_BASE_URL=https://www.brok.fyi \
   SMOKE_SEED_TOKEN="$SMOKE_SEED_TOKEN" \
   bun run check:api-platform-launch -- --require-external
   ```

1. Run the redacted local rotation audit:

   ```bash
   bun run scan:secrets:local
   ```

   The command must not print raw values. Rotate every provider, database, auth,
   search, and platform token referenced by the findings.

2. Replace production secret-store values with the rotated values:

   ```bash
   bun run check:deploy-env -- --provider railway --environment production --service brok
   ```

   The checker validates required names only. It must never be modified to print
   raw secret values.

3. Deploy the current branch and apply migrations:

   ```bash
   bun run migrate
   bun run reconcile:usage-reservations
   ```

   Production must include the usage reservation request-id index and playground
   session key migrations before seeded proof is meaningful.

4. Configure the GitHub Actions repository secret:

   ```text
   SMOKE_SEED_TOKEN
   ```

   This token is required by `.github/workflows/api-platform-production-proof.yml`.
   The workflow fails explicitly when it is absent.

5. Run contract-only public production proof:

   ```bash
   SMOKE_BASE_URL=https://www.brok.fyi \
   STRESS_PLATFORM_CONTRACTS_ONLY=true \
   bun run stress:platform
   ```

6. Run seeded production proof:

   ```bash
   SMOKE_BASE_URL=https://www.brok.fyi \
   SMOKE_SEED_TOKEN="$SMOKE_SEED_TOKEN" \
   bun run smoke:platform

   SMOKE_BASE_URL=https://www.brok.fyi \
   SMOKE_SEED_TOKEN="$SMOKE_SEED_TOKEN" \
   bun run stress:platform
   ```

7. Run the GitHub Actions workflow:

   ```text
   API Platform Production Proof
   ```

   Attach the successful workflow URL and local command output summaries to
   BRO-163, BRO-165, BRO-168, and BRO-182.

## Done Criteria

- `bun run scan:secrets` passes for committed surfaces.
- `bun run check:openapi` passes for the public v1 API contract.
- `bun run check:api-platform-launch` passes for repo-side blocker artifacts.
- `bun run check:api-platform-launch -- --require-external` passes after
  production secret setup.
- `bun run scan:secrets:local` is clean after rotation.
- Production required env names pass provider checks.
- Production migrations are applied.
- `API Platform Production Proof` passes with seeded smoke and stress.
- Linear has the workflow URL or equivalent proof artifact attached to every
  started urgent blocker.
