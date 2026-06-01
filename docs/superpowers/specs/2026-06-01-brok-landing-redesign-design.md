# Brok Landing Page Redesign — Design Spec

**Date:** 2026-06-01
**Status:** Approved (pending implementation)
**Author:** Claude

## Goal

Replace the existing inline `BrokLanding` in `app/page.tsx` with a proper public marketing landing page. The current implementation is a "private beta" gate that only renders for users without app access. The new design treats the root path as a real landing page that explains what Brok is, surfaces the main products, and drives a single clear action.

## Audience & primary action

- **Audience:** Public visitors — both unauthenticated and signed-in-but-unapproved users.
- **Primary action:** Sign in (route to `/auth/login` if not signed in, or `/auth/access-pending` if signed in without access).
- **Secondary surfaces:** Product pages, docs.

## Layout (single page, top to bottom)

1. **Top bar**
   - Brok logo (image at `public/brand/brok-logo.png`, ~28px) + "Brok" wordmark on the left.
   - Theme toggle + "Sign in" text link on the right.
   - Sticky? **No** — keep it simple, no sticky behavior in v1.
   - Border-bottom `border-border/40` for visual separation.

2. **Hero section** (full viewport height minus top bar)
   - **Background:** dark by default. Base color `bg-background` (theme-aware). Overlay: `radial-gradient(ellipse 800px 600px at top right, rgba(249,115,22,0.18), transparent 60%)` from a positioned `div` with `pointer-events-none` and `aria-hidden`.
   - **Center content** (constrained `max-w-3xl`, vertically centered):
     - Logo + "Brok" wordmark at the top of the content stack.
     - Headline (h1): **"One workspace for AI search, code, and email."** — `text-5xl sm:text-6xl font-semibold tracking-tight`.
     - Subhead: "Chat with sources. Build with BrokCode. Triage email with BrokMail. All behind one login." — `text-lg text-muted-foreground`.
     - **Single primary CTA:** `<Button asChild size="lg">` wrapping `<Link href={primaryHref}>` with label "Get started" and a trailing `ArrowRight` icon. `primaryHref` is `/auth/login` for unauthenticated users, `/auth/access-pending` for signed-in users without access.
   - **No secondary CTA in the hero** — keeps the page single-purpose.

3. **Product grid** (3 cards, equal width on `md:` and up, stacked on mobile)
   - Card 1: **Chat & Search** — icon `Search`, body "Fast answers with citations, source review, and deep research jobs." → `/dashboard`.
   - Card 2: **BrokCode** — icon `Code2`, body "A coding-agent workspace for browser, cloud, and TUI workflows." → `/brokcode`.
   - Card 3: **BrokMail** — icon `Mail`, body "Connected Gmail workflows for triage, drafting, and safe actions." → `/brokmail`.
   - Card styling: `rounded-xl border border-border/60 bg-card/40 p-6`, hover state `hover:border-foreground/30 hover:-translate-y-0.5 transition-all`. Internal layout: icon top-left, title `font-semibold`, body `text-sm text-muted-foreground`, trailing `ArrowUpRight` icon (small) anchored top-right to signal linkability.
   - Each card is a clickable `<Link>` covering the whole card.

4. **API strip** (single horizontal row, quiet, smaller text)
   - Layout: `flex items-center justify-center gap-2 text-sm text-muted-foreground`.
   - Content: a small `Plug` icon + the text "Also: the Brok API (OpenAI-compatible)" + a trailing arrow link "Read the quickstart" → `/docs/quickstart`.
   - Styling: no card, no border — just centered text on the page background.

5. **Footer** (minimal)
   - Single row: copyright on the left ("© 2026 Brok"), links on the right ("Docs" → `/docs`, "GitHub" → `https://github.com/animvsh/broksearch-morphic`).
   - `border-t border-border/40`, `py-8`, `text-sm text-muted-foreground`.

## Visual style summary

- **Theme:** Dark by default, theme toggle present (existing `ThemeProvider` already wired in `app/layout.tsx`). The radial gradient overlay is fixed in dark mode; in light mode it's much fainter (lower opacity, e.g. `rgba(249,115,22,0.08)`) so it doesn't overpower a white background.
- **Typography:** Existing fonts (Inter via `app/layout.tsx`). Headline `font-semibold tracking-tight`. Body `font-normal`.
- **Color palette:** Uses existing shadcn/ui CSS variables (`--background`, `--foreground`, `--muted-foreground`, `--border`, `--card`, `--primary`). No new color tokens.
- **Animation:** No scroll animations, no entrance animations in v1. Hover transitions only (`transition-all duration-200`).
- **Spacing:** Generous — `py-24` between sections, `max-w-5xl` outer container, `max-w-3xl` for hero text.

## Component structure

A new component file: **`components/brok/brok-landing.tsx`**.

```ts
// components/brok/brok-landing.tsx
import Link from 'next/link'
import {
  ArrowRight,
  ArrowUpRight,
  Code2,
  Mail,
  Plug,
  Search
} from 'lucide-react'
import { Button } from '@/components/ui/button'

type BrokLandingProps = {
  isSignedIn: boolean
}

const PRIMARY_CTA_LABEL = 'Get started'

export function BrokLanding({ isSignedIn }: BrokLandingProps) {
  const primaryHref = isSignedIn ? '/auth/access-pending' : '/auth/login'
  // ... full implementation per the layout above
}
```

**Why a new file?** The current landing is a 70-line inline function in `app/page.tsx`. Extracting to its own component keeps the route file small and makes the landing reusable (e.g. for the `app/auth/access-pending/page.tsx` if we ever want to redirect there).

**No new UI primitives required.** The page uses existing shadcn/ui components (`Button`) and existing lucide-react icons.

## Wiring changes

**`app/page.tsx`** changes:

- Remove the inline `BrokLanding` function.
- Import `BrokLanding` from `@/components/brok/brok-landing`.
- Replace `<BrokLanding isSignedIn={Boolean(user)} />` (both call sites) with the imported component.

**No other files change.** No new env vars. No new dependencies. No DB schema changes.

## Accessibility

- Semantic HTML: `<main>`, `<header>`, `<section>`, `<footer>`, `<h1>` for the headline, `<h2>` for card titles.
- All interactive elements are real `<Link>` or `<Button>` — no `<div onClick>`.
- The radial gradient overlay has `aria-hidden="true"` and `pointer-events-none`.
- Color contrast: headline on background uses existing `--foreground` (already meets WCAG AA). Body uses `--muted-foreground` (already AA-compliant in both themes).
- Focus states: inherited from shadcn/ui `Button` (`focus-visible:ring-2 focus-visible:ring-ring`).
- Theme toggle: existing `ThemeMenuItems` from `components/theme-menu-items.tsx` (already used in the user menu).

## Error handling

- The page is a pure server component with no data fetching beyond `getCurrentUser()`. Errors from that call are already handled by the existing auth layer.
- No client-side state, no async operations, no retry logic needed.
- If the logo image fails to load, the wordmark "Brok" still renders as a fallback (text is present alongside the image).

## Testing

This is a presentational server component with no logic to test. The page works or it doesn't visually. A smoke check is sufficient:

- **Manual / browser smoke (post-implementation):**
  - Visit `/` while signed out → see the new landing.
  - Visit `/` while signed in but not approved → see the same landing but with the CTA pointing to `/auth/access-pending`.
  - Sign in with an approved account → still redirects to `/` but now renders `<Chat />` (existing behavior, unchanged).
  - Resize to mobile (`< md`) → product grid stacks vertically.
  - Toggle theme → gradient overlay adjusts opacity, all text remains readable.

- **No new unit tests.** The component has no branches worth unit-testing. CI gates (lint, typecheck, build, test) cover the rest.

## Out of scope (explicitly)

- No scroll-triggered animations.
- No video or animated background.
- No "trusted by" / customer logos section.
- No pricing page.
- No testimonials.
- No marketing attribution / analytics beyond what `app/layout.tsx` already loads (Vercel Analytics, conditional on env).
- No CMS or dynamic content — copy is hard-coded in the component.
- No new env vars.
- No changes to auth, API, BrokCode, BrokMail, or any other product surface.

## Files touched

- **New:** `components/brok/brok-landing.tsx`
- **Modified:** `app/page.tsx` (remove inline `BrokLanding`, import the new component)

Total: 1 new file + ~10 line changes to 1 existing file.
