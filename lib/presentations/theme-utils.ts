import { themes, type Theme } from "./themes";

/**
 * Get a theme by its ID.
 * Returns undefined if not found.
 */
export function getThemeById(id: string): Theme | undefined {
  return themes.find((t) => t.id === id);
}

// ---------------------------------------------------------------------------
// Slide content types (used by applyThemeToSlide)
// ---------------------------------------------------------------------------

export interface SlideText {
  type: "heading" | "body" | "bullet" | "caption";
  content: string;
}

export interface SlideContent {
  id: string;
  layout: string;
  heading?: string;
  body?: SlideText[];
  bullets?: string[];
  imageUrl?: string;
  quote?: string;
  quoteAttribution?: string;
  stats?: Array<{ label: string; value: string }>;
  speakerNotes?: string;
}

export interface StyledSlide {
  id: string;
  layout: string;
  styledContent: {
    heading?: {
      text: string;
      color: string;
      fontFamily: string;
      fontSize?: string;
    };
    body?: Array<{
      type: SlideText["type"];
      text: string;
      color: string;
      fontFamily: string;
    }>;
    bullets?: Array<{
      text: string;
      color: string;
      fontFamily: string;
    }>;
    imageUrl?: string;
    quote?: {
      text: string;
      attribution?: string;
      color: string;
      accentColor: string;
      fontFamily: string;
    };
    stats?: Array<{
      label: string;
      value: string;
      valueColor: string;
      labelColor: string;
      fontFamily: string;
    }>;
  };
  background: string;
  cardBackground: string;
  secondaryColor: string;
}

/**
 * Apply a theme's colors and fonts to raw slide content,
 * returning a StyledSlide ready for rendering.
 */
export function applyThemeToSlide(
  theme: Theme,
  slide: SlideContent
): StyledSlide {
  const { colors, fonts } = theme;

  const styledContent: StyledSlide["styledContent"] = {};

  if (slide.heading) {
    styledContent.heading = {
      text: slide.heading,
      color: colors.text,
      fontFamily: fonts.heading,
    };
  }

  if (slide.body) {
    styledContent.body = slide.body.map((item) => ({
      type: item.type,
      text: item.content,
      color: colors.text,
      fontFamily: fonts.body,
    }));
  }

  if (slide.bullets) {
    styledContent.bullets = slide.bullets.map((text) => ({
      text,
      color: colors.text,
      fontFamily: fonts.body,
    }));
  }

  if (slide.imageUrl) {
    styledContent.imageUrl = slide.imageUrl;
  }

  if (slide.quote) {
    styledContent.quote = {
      text: slide.quote,
      attribution: slide.quoteAttribution,
      color: colors.text,
      accentColor: colors.accent,
      fontFamily: fonts.body,
    };
  }

  if (slide.stats) {
    styledContent.stats = slide.stats.map((stat) => ({
      label: stat.label,
      value: stat.value,
      valueColor: colors.accent,
      labelColor: colors.secondary,
      fontFamily: fonts.body,
    }));
  }

  return {
    id: slide.id,
    layout: slide.layout,
    styledContent,
    background: colors.background,
    cardBackground: colors.card,
    secondaryColor: colors.secondary,
  };
}

// ---------------------------------------------------------------------------
// CSS variable injection helpers for runtime theme switching
// ---------------------------------------------------------------------------

/**
 * Inject theme CSS variables into a DOM element (or the document root).
 * Useful for runtime theme switching without a full re-render.
 *
 * @example
 * const theme = getThemeById("startup_pitch");
 * if (theme) injectThemeVariables(theme);
 */
export function injectThemeVariables(
  theme: Theme,
  root: HTMLElement | Document = document
): void {
  const el =
    root instanceof Document ? root.documentElement : root;
  const { colors } = theme;

  el.style.setProperty("--slide-bg", colors.background);
  el.style.setProperty("--slide-text", colors.text);
  el.style.setProperty("--slide-accent", colors.accent);
  el.style.setProperty("--slide-secondary", colors.secondary);
  el.style.setProperty("--slide-card", colors.card);
}

/**
 * Remove theme CSS variables from a DOM element.
 */
export function removeThemeVariables(
  root: HTMLElement | Document = document
): void {
  const el =
    root instanceof Document ? root.documentElement : root;
  el.style.removeProperty("--slide-bg");
  el.style.removeProperty("--slide-text");
  el.style.removeProperty("--slide-accent");
  el.style.removeProperty("--slide-secondary");
  el.style.removeProperty("--slide-card");
}
