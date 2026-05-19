# Discover, Library, and Spaces PRD

Last updated: 2026-05-19
Owner: Brok product and engineering
Status: Draft for Linear execution

## Summary

Discover, Library, and Spaces are Brok's workspace memory surfaces. They turn saved chats, citations, uploads, tasks, and product activity into navigable knowledge. These pages must move beyond hub pages into a useful saved-thread, collection, and research-space system.

## Current Implementation Anchors

- Discover page: `app/discover/page.tsx`
- Library page: `app/library/page.tsx`
- Spaces page: `app/spaces/page.tsx`
- Data aggregation: `lib/actions/platform-dashboard.ts`
- Background task routes: `app/api/tasks/*`
- Upload routes: `app/api/upload/route.ts`, `app/api/uploads/[...path]/route.ts`

## Target Users

- Research-heavy Brok user who wants to reopen prior work.
- Founder/operator collecting sources, docs, and email/code outcomes.
- Team member using Spaces as lightweight project context.

## Product Goal

Make Brok remember and organize real work. Users should be able to find prior threads, cited sources, files, running tasks, and product-specific activity without hunting through chat history.

## Requirements

### Discover

- Show recent research threads from actual saved workspace data.
- Generate suggested prompts from recent thread titles and source patterns.
- Surface top source domains and active spaces.
- Links must reopen the correct saved thread.
- Empty states must guide the user to start a search.

### Library

- Show saved threads ordered by latest activity.
- Show source, file, public/share, and active task counts.
- Show source domains and collections.
- Support filtering by product surface, source domain, uploaded file presence, and visibility.
- Add search across saved thread title and source title.

### Spaces

- Spaces should group threads into Research, BrokMail, BrokCode, and API Platform.
- Space assignment can start heuristic-based but must be explainable and editable later.
- Each space should show thread count, source count, file count, task count, and latest work.
- Active tasks must show status, kind, update time, and link back to the relevant chat or product surface.

### Files and Uploads

- Uploaded files should appear in Library and relevant Spaces.
- File Q&A should preserve the source document title and link.
- Failed upload or extraction should be visible as a recoverable state.

### Background Tasks

- Long tasks must survive tab closure.
- Task ledger must show queued, running, completed, failed, and canceled states.
- Deep research and BrokCode runs must write status into the same task system.

## Acceptance Criteria

- A signed-in user can open `/discover`, `/library`, and `/spaces`.
- Recent saved chats appear in all relevant surfaces.
- Source domains are computed from actual cited source parts.
- Files and file counts appear after upload.
- Active background tasks appear while running and disappear or move to completed when done.
- Thread links reopen the matching `/search/[id]` route.
- Empty workspaces show useful zero states.

## Non-Goals

- Chrome/browser copilot.
- A separate Notion-style editor.
- Manual team knowledge base permissions beyond existing Brok auth in this phase.

## Launch Checklist

- Browser QA with an account that has saved chats, sources, uploaded files, and background tasks.
- Mobile QA for all three surfaces.
- Verify RLS/user scoping on all aggregated data.
- Confirm no cross-user data leakage.
