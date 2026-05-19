# Brok Tools and Subproducts PRD

Last updated: 2026-05-19
Owner: Brok product and engineering
Status: Draft for Linear execution

## Summary

Brok Tools is a collection of focused utilities that should feel production-ready and searchable, starting with the AI Humanizer. Subproducts should be discoverable from the app, gated through Brok access, server-rendered where useful, and instrumented like the rest of the platform.

## Current Implementation Anchors

- Tools index: `app/tools/page.tsx`
- Humanizer page: `app/tools/humanizer/page.tsx`
- Humanizer UI: `components/tools/ai-humanizer-tool.tsx`
- App metadata: `app/layout.tsx`, route-level `metadata` exports

## Target Users

- Writer who wants AI-generated text to sound natural.
- Brok user who wants utility workflows without leaving the product.
- Admin who wants visibility into feature requests and tool usage.

## Product Goal

Make Brok Tools feel like polished product surfaces, not experiments. Each tool should have a clear job, real functionality, good metadata, fast UI, and a path into broader Brok workflows.

## Requirements

### Tools Index

- `/tools` lists available tools with route, description, icon, and status.
- The page requires Brok app access.
- Tools should be server-rendered with route metadata for search discovery where public indexing is allowed.

### AI Humanizer

- Humanizer should detect and rewrite common AI-writing patterns.
- It should support optional voice calibration from user-provided writing samples.
- It should show before/after output and a lightweight pattern audit.
- It should avoid over-polishing into generic corporate copy.
- It should preserve meaning, factual claims, citations, and user-provided formatting unless the user asks to change them.

### Feature Request Widget

- Fixed bottom-right widget should collapse to a question mark when closed.
- On hover, it should expand back to "Features?".
- Signed-in submissions must attach account identity.
- Admin panel must show account, request text, timestamp, status, and triage notes.

### SEO and Metadata

- Tool routes should export clear `metadata`.
- Public marketing/discoverability pages can be indexed later; gated product pages should avoid leaking private data.
- Open Graph metadata should reflect Brok product names.

### Telemetry

Track:

- Tool opened.
- Humanizer run count, input length bucket, output length bucket, pattern count, latency, and error.
- Feature request submitted, account ID, route, and status.

## Acceptance Criteria

- A signed-in user can open `/tools` and `/tools/humanizer`.
- Humanizer rewrites text and shows a useful pattern audit.
- Voice sample changes output style.
- Feature request widget submits and appears in admin.
- Route metadata exists for Tools and Humanizer.
- Mobile layout is usable.

## Non-Goals

- Building a marketplace of tools in this phase.
- Replacing BrokMail or BrokCode workflows with tool pages.

## Launch Checklist

- Humanizer tested with short, long, and heavily AI-sounding input.
- Accessibility checked for keyboard input and copy actions.
- Feature request admin queue verified.
- SEO metadata verified on server-rendered route output.
