# Brok Landing Page Redesign — Design Spec

**Date:** 2026-06-01
**Status:** Implemented (`a30d2a6`, plus follow-up floating-cards revision)
**Author:** Claude

## Goal

Replace the existing inline `BrokLanding` in `app/page.tsx` with a proper public marketing landing page. The current implementation is a "private beta" gate that only renders for users without app access. The new design treats the root path as a real landing page that explains what Brok is, surfaces the main products visually, and drives a single clear action.

## Audience & primary action

- **Audience:** Public visitors — both unauthenticated and signed-in-but-unapproved users.
- **Primary action:** Sign in (route to `/auth/login` if not signed in, or `/auth/access-pending` if signed in without access).
- **Secondary surfaces:** Product pages, docs.

## Layout (top to bottom)

### 1. Top nav

- **Left:** Brok logo (animated `IconBlinkingLogo` in a `brand-mark` square) + "Brok" wordmark. Links to `/`.
- **Center (md+):** Nav links — Features → `/dashboard`, BrokCode → `/brokcode`, BrokMail → `/brokmail`, Docs → `/docs`. Hidden on mobile to keep the bar tight.
- **Right:** "Sign in" text link (hidden on `< sm`) + primary "Get started" `Button` (size `sm`, h-9). "Get started" routes to `/auth/login` or `/auth/access-pending` based on `isSignedIn`.
- Container: `max-w-6xl mx-auto`, `px-5 sm:px-8 pt-6`.

### 2. Hero section

- **Background overlay:** a single soft blue radial gradient (`rgba(47,126,231,0.18)` → transparent, ~40rem wide), centered horizontally at the top of the section, blurred 3xl, pointer-events-none, aria-hidden.
- **Four floating preview cards** in the corners of the hero (`hidden lg:block`, pointer-events-none, slight rotation, subtle drop shadow, white card with backdrop blur):
  - **Top-left:** a yellow sticky note (`#fde68a`) with the text "Take notes to keep track of crucial details and meaningful next tasks with ease." Card rotation: `-rotate-[3deg]`. Note is itself rotated -2deg inside the card.
  - **Top-right:** a "Reminders" mini-card — `Mail` icon header, one entry "Today's meeting / 9:00 — 10:00" with an amber icon chip. Card rotation: `rotate-[2deg]`.
  - **Bottom-left:** a "Today's tasks" mini-card — two progress rows ("New ideas for campaign 80%", "Design WP 4.0 60%") with thin progress bars in emerald and amber. Card rotation: `-rotate-[2deg]`.
  - **Bottom-right:** a "100+ Integrations" mini-card — 5 brand-icon tiles (Gmail, Slack, GitHub, Linear, Notion) from `react-icons/si`, each in their brand color. Card rotation: `rotate-[3deg]`.
- **Center content** (`max-w-3xl`, vertically stacked, centered):
  - Pill badge: `IconBlinkingLogo` + "Brok" wordmark on a `bg-white/80` rounded-full pill with subtle shadow.
  - **Search input mockup card** (the visual focal point of the hero): a `rounded-2xl border bg-white/90 backdrop-blur-md` card with `Search` icon, placeholder text "Ask Brok anything…", and a small `ArrowRight` submit button on a black square. Width: `w-72 sm:w-80`.
  - **Headline (h1):** two-tone, on two lines, `text-5xl sm:text-7xl font-semibold leading-[1.05] tracking-tight`:
    - Line 1 (dark, bold, `text-zinc-950`): "Search, code, and connect"
    - Line 2 (lighter, regular weight, `text-zinc-400`): "all in one place"
  - **Subhead** (`text-zinc-500`): "One workspace for AI search with sources, coding agents, and email workflows. Behind one login."
  - **Single primary CTA** — `<Button asChild size="lg">` with "Get started" + trailing `ArrowRight` that nudges on hover.

### 3. Mobile product grid (mobile only)

- On viewports below `lg`, the four floating preview cards are hidden, and a simple 3-card product grid renders below the hero so visitors still see Search / BrokCode / BrokMail.
- Each card: small icon chip, title, one-line body, `ArrowUpRight` hover indicator. Same destination routes as the desktop floating cards.

### 4. API strip

- Quiet centered line (`text-sm text-zinc-500`): `FileText` icon + "Also: the Brok API (OpenAI-compatible) · Read the quickstart →" linking to `/docs/quickstart`.

### 5. Footer

- Single row: copyright ("© 2026 Brok") on the left, "Docs" + "GitHub" links on the right.
- GitHub URL: `https://github.com/animvsh/broksearch-morphic`.
- `border-t border-zinc-200/80`, `py-6`, `text-sm text-zinc-500`.

## Visual style

- **Theme:** light by default (the project doesn't currently differentiate tokens between light and dark; `ThemeProvider` toggles the `dark` class but `--background` etc. are unchanged). All colors used in this design (`zinc-*`, `white`, `bg-emerald-500`, `bg-amber-500`, `#fde68a`) are fixed values and read the same in both modes. This is a known limitation of the current design system and is out of scope for this spec.
- **Typography:** inherits the project's Geist/Inter font stack from `app/layout.tsx`. No new font families except the optional `Caveat` fallback in the sticky note (graceful fallback to `Comic Sans MS` if Caveat isn't loaded).
- **Color palette:** zinc neutrals (50/100/200/400/500/600/700/800/900/950) for chrome; brand blue `#2f7ee7` for the soft hero glow; amber `#fde68a` for the sticky note; emerald/amber for progress bars. No new design-system tokens introduced.
- **Animation:** static, no scroll/entrance animations in v1. Hover transitions only (`transition-all duration-300` on cards; `group-hover:translate-x-0.5` on the CTA arrow). Each `FloatingCard` accepts a `delay` prop (currently unused) for future scroll-staggered entrance.
- **Spacing:** `pt-16 sm:pt-24` at the top of the hero, `pb-28` at the bottom, `max-w-6xl` outer, `max-w-3xl` for the hero text block.

## Component structure

One new file: **`components/brok/brok-landing.tsx`**.

- `BrokLanding({ isSignedIn })` — main export. Server component. Pure presentation; no state, no effects.
- `FloatingCard` — internal helper for the 4 corner preview cards. Props: `className` (positions), `children`, `delay` (unused, reserved for future animation).
- `FloatingStickyNote`, `FloatingReminders`, `FloatingTasks`, `FloatingIntegrations` — four internal components, one per floating card.
- `ProductCardMobile` — internal helper for the mobile product grid.

**No new UI primitives required.** Uses existing shadcn/ui `Button`, existing `IconBlinkingLogo`, `react-icons/si` (already in dependencies), and `lucide-react` icons.

## Wiring changes

- **New:** `components/brok/brok-landing.tsx`
- **Modified:** `app/page.tsx` — drop the inline `BrokLanding` function (~70 lines), import the new component from `@/components/brok/brok-landing`.
- **No other files change.** No new env vars. No new dependencies. No DB schema changes.

## Accessibility

- Semantic HTML: `<main>`, `<header>`, `<nav>`, `<section>`, `<footer>`, `<h1>` for the headline, `<ul>/<li>` for the product lists.
- All interactive elements are real `<Link>` or `<Button>` — no `<div onClick>`.
- The radial gradient overlay and the four floating cards are `aria-hidden="true"` and `pointer-events-none` so they don't interfere with screen readers or pointer events.
- Color contrast: dark headline on white exceeds WCAG AAA. Subhead (`text-zinc-500`) and the second headline line (`text-zinc-400`) are AA on white. The light "all in one place" line is intentionally softer — it remains readable but is visually subordinate.
- Focus states: inherited from shadcn/ui `Button` (`focus-visible:ring-2 focus-visible:ring-ring`).

## Error handling

- The page is a pure server component with no data fetching beyond `getCurrentUser()`. Errors from that call are already handled by the existing auth layer.
- No client-side state, no async operations, no retry logic needed.
- If the logo image fails to load, the wordmark "Brok" still renders as a fallback (text is present alongside the image).

## Testing

This is a presentational server component with no logic to test. Manual / browser smoke (post-implementation):

- Visit `/` while signed out → see the new landing with the floating cards, hero, and "Get started" CTA.
- Visit `/` while signed in but not approved → same landing but the CTA points to `/auth/access-pending`.
- Sign in with an approved account → still redirects to `/` but now renders `<Chat />` (existing behavior, unchanged).
- Resize to mobile (`< lg`) → floating cards disappear, mobile product grid appears, hero text and CTA remain centered and readable.
- Resize to very small (`< sm`) → nav links collapse, "Sign in" link collapses, primary "Get started" button remains.
- Toggle theme → no visual changes (light/dark tokens are identical in the current design system).

**No new unit tests.** CI gates (`bun lint`, `bun typecheck`, `bun run build`, `bun run test`) cover the rest.

## Out of scope (explicitly)

- No scroll-triggered entrance animations on the floating cards (the `delay` prop on `FloatingCard` is reserved for that, but not wired up in v1).
- No video, no animated background, no parallax.
- No "trusted by" / customer logos section.
- No pricing page.
- No testimonials.
- No marketing attribution / analytics beyond what `app/layout.tsx` already loads.
- No CMS or dynamic content — copy is hard-coded in the component.
- No new env vars.
- No changes to auth, API, BrokCode, BrokMail, or any other product surface.

## Files touched

- **New:** `components/brok/brok-landing.tsx`
- **Modified:** `app/page.tsx` (remove inline `BrokLanding`, import the new component)

Total: 1 new file + ~10 line changes to 1 existing file.
