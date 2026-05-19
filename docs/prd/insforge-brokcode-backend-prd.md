# InsForge + BrokCode Backend PRD

Last updated: 2026-05-19
Owner: Brok product and engineering
Status: Draft for Linear execution
Linear: [BRO-49](https://linear.app/askdad/issue/BRO-49/prd-integrate-insforge-as-brokcode-backend-provider)

## Summary

InsForge should become a first-class backend provider inside BrokCode. BrokCode remains the user-facing builder, MiniMax remains the LLM/planning layer, and InsForge supplies backend primitives for generated full-stack apps: database, auth, storage, functions, realtime, model gateway, compute where available, and deployment.

## External References

- GitHub: https://github.com/InsForge/InsForge
- Docs: https://docs.insforge.dev/introduction
- Agent workflow: https://insforge.dev/skill.md
- Docs index: https://docs.insforge.dev/llms.txt

## Product Goal

Let a BrokCode user create or link an InsForge backend from the web builder, then generate a real full-stack app that can use InsForge auth, database, storage, functions, realtime, and deployment. The user should see both cloud frontend status and backend status from one BrokCode workspace.

## Current Brok Anchors

- Builder UI: `components/brokcode/brokcode-app.tsx`
- Builder page: `app/brokcode/page.tsx`
- Execution route: `app/api/brokcode/execute/route.ts`
- Project routes: `app/api/brokcode/projects/*`
- Deploy route: `app/api/brokcode/deploy/route.ts`
- Session sync: `app/api/brokcode/sessions/route.ts`
- Versions: `app/api/brokcode/versions/route.ts`
- Brok model/provider routing: `lib/brok/models.ts`, `lib/brok/provider-router.ts`
- BrokCode stores: `lib/brokcode/*`

## Requirements

### Backend Provider Selection

- Project setup supports backend provider choices: none, new InsForge, existing InsForge, and self-hosted InsForge.
- New InsForge flow can use the agent signup API once per user request.
- Existing/self-hosted flow accepts project URL plus secret admin key through secure server-side storage.
- Project records store backend provider, status, project URL, dashboard URL, claim URL, region, app key, health, and last checked time.

### Secret Safety

- InsForge `accessApiKey` is stored server-side only.
- Generated apps receive only public/anonymous client config.
- No admin key may be logged, committed, returned to the browser, or written into `NEXT_PUBLIC_*`/`VITE_*` env vars.
- Redaction must apply to runtime logs, session events, admin views, and errors.

### Agent Workflow

- BrokCode fetches InsForge backend context before backend-dependent edits.
- Context includes health, metadata, tables, schema, migrations, buckets, functions, auth config, logs, and available capabilities.
- MiniMax-backed planning should decide when to create tables, migrations, functions, buckets, and auth flows.
- The builder must use InsForge's documented agent workflow: `npx @insforge/cli`, link/current/metadata, and installed InsForge skills where applicable.

### Provisioning

- For new InsForge cloud/trial projects, call signup exactly once.
- Poll the returned project URL until it is no longer `503`/unreachable, capped at 3 minutes.
- If provisioning times out, surface the error and do not retry automatically.
- Show claim URL clearly when trial projects are used.

### Builder UI

- BrokCode preview area shows both frontend preview/deploy URL and backend URL/status.
- Project details include backend provider badge, health, dashboard link, claim link, and capability list.
- Failures are explicit: signup failed, health timeout, expired trial, invalid self-host URL, invalid key, InsForge limit hit, and unsupported capability.

### Deployment

- Deploy flow should carry InsForge public config into generated app env.
- Frontend deployment and backend status should be visible together.
- Self-hosted InsForge should remain operator-owned; BrokCode should not assume local Docker.

### Admin and Telemetry

- Admin sees count of InsForge-backed projects, health failures, provisioning failures, and usage.
- Usage logs include backend provider and project ID without secrets.
- BrokCode versions include backend provider metadata.

## Acceptance Criteria

- A signed-in user can create a BrokCode project with InsForge selected.
- BrokCode securely stores InsForge backend metadata and associates it with the project/workspace.
- BrokCode polls and displays InsForge health, project URL, dashboard URL, and claim URL.
- A MiniMax-powered BrokCode run can generate a simple full-stack app using InsForge auth/database/storage.
- Generated frontend env contains only public InsForge config.
- Backend schema, migrations, functions, and logs are available to the BrokCode agent context.
- Errors are precise and never leak secret keys.
- Linear/admin/docs explain self-hosted, existing, and cloud/trial InsForge modes.

## Non-Goals

- Replacing Brok account auth with InsForge auth.
- Forcing all BrokCode apps to use InsForge.
- Building a Docker-only local flow for users who want remote operation.
- Automatically retrying trial signup after provisioning failure.

## Risks

- Trial projects expire unless claimed.
- InsForge compute and email are private preview, so those capabilities must be checked before use.
- Secret handling mistakes could leak backend admin access.
- Self-hosted InsForge requires operator-controlled deployment and networking.
