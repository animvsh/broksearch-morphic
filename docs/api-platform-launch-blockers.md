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
- `bun run check:api-platform-launch` passes for repo-side blocker artifacts.
- `bun run check:api-platform-launch -- --require-external` passes after
  production secret setup.
- `bun run scan:secrets:local` is clean after rotation.
- Production required env names pass provider checks.
- Production migrations are applied.
- `API Platform Production Proof` passes with seeded smoke and stress.
- Linear has the workflow URL or equivalent proof artifact attached to every
  started urgent blocker.
