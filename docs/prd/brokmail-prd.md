# BrokMail PRD

Last updated: 2026-05-19
Owner: Brok product and engineering
Status: Draft for Linear execution

## Summary

BrokMail is a connected email workspace inside Brok. It should feel like a fast, calm, AI-native email client: inbox on one side, agent on the other, approvals for risky actions, and real Gmail/Google Calendar operations through Composio. The product must not rely on platform-level Google OAuth. Users sign into Brok, then connect Gmail and Calendar through Composio popups.

## Product Goal

Turn Gmail and Calendar into an action-oriented workspace where a user can triage, search, summarize, draft, archive, and schedule without leaving Brok. The assistant should be concise by default, use live mailbox context, and never pretend to complete external actions before approval.

## Current Implementation Anchors

- Page gate: `app/brokmail/page.tsx`
- Main UI: `components/brokmail/brokmail-app.tsx`
- Pi assistant route: `app/api/brokmail/pi-agent/route.ts`
- Gmail connection/status/threads: `app/api/brokmail/gmail/*`
- Calendar connection/status/events: `app/api/brokmail/gcal/*`
- Approval and Composio action execution: `app/api/brokmail/composio/*`
- Data types: `lib/brokmail/data.ts`
- Integration error handling: `lib/brokmail/integration-errors.ts`

## Target Users

- Founder or operator with a high-volume inbox.
- Developer using Brok as a personal operating system.
- Admin reviewing connected workflow safety.

## Primary Jobs

1. Triage today: identify priority threads, unanswered emails, follow-ups, and low-value newsletters.
2. Draft replies: generate short, editable replies in the user's voice, grounded in the selected thread.
3. Search mailbox: find threads by sender, subject, body, label, and action context.
4. Take safe actions: create drafts, archive threads, and create/delete calendar events only after approval.
5. Coordinate calendar: inspect events, propose meeting times, and create approved calendar events.

## Requirements

### Authentication and Access

- BrokMail requires signed-in Brok access through `requireAppAccess('/brokmail')`.
- Platform Google OAuth must stay disabled for Brok login.
- Gmail and Calendar connections must use Composio popup flows.
- If a connector is missing or expired, the UI must clearly show a reconnect state without breaking the page.

### Mailbox Experience

- The default view should load a live Gmail inbox when connected.
- Views must include Inbox, Needs Reply, Follow-ups, Drafts, Sent, Newsletters, Receipts, Calendar, and Automations.
- Sorting must support Priority, Newest, and Sender.
- Search must work across sender, sender email, subject, snippet, labels, summaries, and message bodies.
- Empty states must explain the next action: connect Gmail, reconnect, or start a search.
- Thread cards must be dense, readable, and stable on mobile and desktop.

### Agent Experience

- BrokMail chat is powered by Pi through `app/api/brokmail/pi-agent/route.ts`.
- The prompt must include selected thread, selected calendar event, bounded mailbox context, and bounded calendar context.
- Responses must be short by default and avoid long "thinking" style answers for simple tasks.
- The assistant must use live context only. If the context is empty, it should say the connector must be connected.
- The assistant must not claim an action was sent, archived, deleted, or scheduled before approval.

### Actions and Approvals

- Draft creation must create a Gmail draft only, never send mail.
- Archive must remove Inbox labels only, never delete mail.
- Calendar creation/deletion must require explicit approval.
- Approval tokens must be signed, expire, and be consumed once.
- Action payloads must validate target thread IDs, provider IDs, draft body, event title, start, and end.

### Automations

- Automation UI should support rules for newsletters, receipts, follow-ups, and draft review.
- Any automation that changes Gmail or Calendar must run in approval mode until production safety review is complete.
- Automation history should show last run, result, skipped reason, and approval status.

### Performance

- Initial usable page load should not block on slow connector calls.
- Gmail thread fetch should return within 4 seconds for normal inbox size, or show progressive loading.
- Agent requests should return first visible response within 3 seconds for short commands when Pi is available.
- Long tasks should move into the background task ledger instead of freezing the chat.

### Telemetry

Track:

- Connector status: connected, missing, expired, error.
- Gmail fetch latency and result count.
- Calendar fetch latency and result count.
- Assistant latency and failure rate.
- Approval created, approved, rejected, expired, consumed.
- Composio action success/failure and tool slug used.

## Acceptance Criteria

- A signed-in allowlisted user can open `/brokmail`.
- A user can connect Gmail through a popup and return to BrokMail with connected status.
- A connected user can load real Gmail threads.
- A connected user can search and filter threads without reload.
- A user can ask "triage today" and receive a concise answer using visible live threads.
- A user can select a thread, ask for a reply, review the draft, approve draft creation, and see a success state.
- A user can archive one or more threads only through approval.
- A user can connect Calendar, load events, and create a calendar event through approval.
- Error states never show raw provider JSON unless in a developer/admin detail area.

## Non-Goals

- Sending email directly without a second explicit approval.
- Replacing Brok account auth with Google login.
- Building a standalone Gmail clone outside Brok.
- Browser extension or Chrome copilot work.

## Launch Checklist

- Gmail connect, status, fetch, draft, and archive verified against a real connected account.
- Google Calendar connect, status, fetch, create, and delete verified against a real connected account.
- Pi unavailable path shows a helpful retry message.
- Browser QA passes desktop and mobile layouts.
- Logs and admin dashboards show BrokMail usage and failures.
