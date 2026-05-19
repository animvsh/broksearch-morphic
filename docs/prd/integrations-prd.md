# Brok Integrations PRD

Last updated: 2026-05-19
Owner: Brok product and engineering
Status: Draft for Linear execution

## Summary

Brok Integrations is the connection layer for Gmail, Google Workspace, GitHub, Linear, Slack, Supabase, and future tools. It uses Composio popups, not platform OAuth, and gives Brok agents the authenticated tool access they need.

## Current Implementation Anchors

- Integrations page: `app/integrations/page.tsx`
- Connect route: `app/api/integrations/[toolkit]/connect/route.ts`
- Status route: `app/api/integrations/[toolkit]/status/route.ts`
- Composio client: `lib/integrations/composio.ts`
- Composio tool UI: `components/integrations/integration-rows-client.tsx`
- Composio agent tool: `lib/tools/composio-integrations.ts`

## Target Users

- Brok user connecting personal or workspace tools.
- Admin verifying enabled connectors and connected account counts.
- Agent workflow author who needs tool availability.

## Requirements

### Connection Model

- All connections use Composio popup flows.
- Callback redirect returns to the originating Brok surface when possible.
- Supported featured toolkits: Google Super, Gmail, Google Calendar, Google Docs, Google Meet, GitHub, Linear, Supabase, Slack.
- The page must show ready, connected, unavailable, and error states.
- Toolkit aliases must normalize consistently across UI, routes, and env config.

### UX

- Connection should open as a popup, not a full tab.
- Connecting state should have a visible animated status.
- After callback, the UI should refresh status automatically.
- Error text should be human-readable and avoid raw provider dumps.

### Security

- Generic integration routes require authenticated Brok users.
- No anonymous fallback user IDs in production.
- Connected account IDs should be scoped to the Brok user/session.
- Tool execution should require explicit product-level approval for risky writes.

### Developer Configuration

- Env IDs must support the current Composio auth config keys:
  - `COMPOSIO_GMAIL_AUTH_CONFIG_ID`
  - `COMPOSIO_GOOGLECALENDAR_AUTH_CONFIG_ID`
  - `COMPOSIO_GITHUB_AUTH_CONFIG_ID`
  - `COMPOSIO_LINEAR_AUTH_CONFIG_ID`
  - `COMPOSIO_GOOGLEDOCS_AUTH_CONFIG_ID`
  - `COMPOSIO_GOOGLEMEET_AUTH_CONFIG_ID`
  - `COMPOSIO_GOOGLESUPER_AUTH_CONFIG_ID`
- `COMPOSIO_CONNECT_TOOLKITS` controls visible Connect-mode toolkits.

## Acceptance Criteria

- A signed-in user can open `/integrations`.
- Each configured toolkit appears with accurate ready/connected status.
- Clicking Connect opens a popup and returns to Brok.
- Gmail, Google Calendar, GitHub, Linear, Google Docs, Google Meet, and Slack status routes return deterministic JSON.
- Failed Composio calls surface a concise reconnect/setup message.
- Product surfaces can request a connector and open the same popup flow.

## Non-Goals

- Rebuilding Composio's account management UI.
- Platform-level Google OAuth for Brok login.
- Silent background writes through integrations.

## Launch Checklist

- Real Composio accounts verified for Gmail, Calendar, GitHub, and Linear.
- Popup callback tested locally and in production.
- Mobile layout tested.
- Admin visibility for connected account count confirmed.
