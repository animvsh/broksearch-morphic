# Search Better-Than-Perplexity Overhaul

**Date:** 2026-06-01
**Branch:** animvsh/use-repo-for-testing
**Status:** Approved (full overhaul selected)

## Goal

Transform the search experience into something that beats Perplexity on speed, polish, source quality, follow-ups, and overall feel. Scope: the home page search (`/`) and the dedicated `/search/[id]` thread view.

## Scope

**In scope:**
- Empty/landing state redesign
- Streaming experience (phase-based progress)
- Answer surface (inline citations, source cards, follow-ups, action toolbar)
- Mode selector polish
- Mobile-responsive treatments

**Out of scope (YAGNI):**
- Spaces, Library, Admin redesigns
- Auth changes
- New search providers / embedding models
- Voice input (v2)

## Architecture

Three layers, one job each:

1. **Empty/landing state** — centered input, mode pills, trending examples, recent searches. No sidebar clutter.
2. **Streaming engine** — source-gathering progress, token streaming, citation emergence, mode-aware skeletons.
3. **Answer surface** — inline numbered citations, source cards, follow-ups, action toolbar, share.

Key principle: every visible state has a designed treatment. No blank flashes, no generic "loading…" placeholders.

## Visual Direction

- **Aesthetic:** clean, modern, slightly editorial. Generous whitespace, large readable type, restrained color, animated micro-interactions. Stronger typographic hierarchy and source density than Perplexity.
- **Color:** monochrome zinc/neutral base with a single accent (electric blue or deep purple). Dark mode native.
- **Type:** Inter for UI, with serif fallback for answer body to feel more "publication" than "chat".
- **Motion:** 150–250ms ease-out transitions. Subtle entrance animations on new sources and citations. Skeleton shimmer (not spinners).

## Feature Specifications

### Empty State
- Centered logo + input
- 4 mode pills: Quick (⚡), Search (🔍), Deep Research (🧠), Code (⌘)
  - Each with brief description and estimated time
- "Try asking" — 6 example query cards (rotates on refresh)
- "Recent searches" — last 5, click to re-run
- No sidebar on home — full-bleed hero

### Streaming Phases
- **Phase 1 (0–500ms):** "Reading sources…" with animated progress bar
- **Phase 2 (sources arrive):** "Found N sources" with thumbnail strip
- **Phase 3 (synthesis):** Token-by-token streaming with smooth caret
- Live elapsed time counter
- Cancel button always visible during streaming

### Answer Surface
- Inline numbered superscripts [1], [2], [3] — Perplexity style
- Hover any citation: popover with source title, favicon, snippet
- Click citation: smooth scroll to source card
- Source cards: favicon, domain, title (link), 2-line snippet, "Open" button
- "Show all N sources" toggle
- "Was this helpful?" + thumbs up/down after answer

### Follow-ups
- 3–4 smart suggestions inline below answer
- Each labeled by type: "Dive deeper", "Different angle", "Related", "Compare"
- Click to send as new query in same thread
- Regenerate button always available

### Action Toolbar
- Copy (formatted Markdown)
- Share (link)
- Regenerate
- Read aloud
- Translate (50+ languages)

### Mobile
- Source cards become bottom sheet
- Mode selector becomes full-screen modal
- Touch targets minimum 44px
- Swipe to dismiss sources

## Components

**New:**
- `components/search/hero.tsx` — empty state
- `components/search/mode-selector-v2.tsx` — better mode pills
- `components/search/streaming-progress.tsx` — phase-based progress UI
- `components/search/citation-marker.tsx` — inline [1] with hover popover
- `components/search/source-card.tsx` — rich source preview
- `components/search/follow-up-suggestions.tsx` — smart follow-ups
- `components/search/answer-toolbar.tsx` — copy/share/regenerate/etc.
- `components/search/example-queries.tsx` — rotating example cards
- `lib/streaming/smooth-caret.tsx` — token-by-token animation
- `hooks/use-streaming-phases.ts` — phase machine

**Modify:**
- `app/page.tsx` — render new hero
- `components/chat.tsx` — wire up new components
- `components/chat-messages.tsx` — citation rendering
- `components/chat-panel.tsx` — better input experience

## Data Flow

```
User submits query
    ↓
Phase 1: "Reading sources…"  → search.start
Phase 2: "Found N sources"   → search.results
Phase 3: "Synthesizing..."   → token chunks
Phase 4: Answer complete     → answer.done + follow-ups
    ↓
Render: Hero → Message + Citations + Source cards + Follow-ups
```

Existing `/api/search` and `/api/chat` endpoints extended to emit phase events. No new backend for v1; phases are derived from current streaming events.

## Success Criteria

- Sub-200ms perceived time-to-first-byte (skeleton appears immediately)
- Phase indicators update in real-time during streaming
- Citations work on hover and click
- Follow-ups are contextual and labeled
- Mobile feels native (not just responsive)
- Lighthouse score ≥ 95 on search page

## Implementation Order

1. Hero + mode selector (visual foundation)
2. Streaming phase UI
3. Citation markers + source cards
4. Follow-up suggestions
5. Action toolbar
6. Mobile polish
7. Performance + accessibility audit
