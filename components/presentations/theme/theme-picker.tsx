"use client";

import { Check } from "lucide-react";

import { type Theme, type ThemeId,themes } from "@/lib/presentations/themes";
import { cn } from "@/lib/utils";

interface ThemePickerProps {
  selectedThemeId: ThemeId | "auto" | null;
  onSelect: (themeId: ThemeId | "auto") => void;
}

function isGradient(background: string): boolean {
  return background.startsWith("linear-gradient");
}

function ThemeSwatch({ theme }: { theme: Theme }) {
  const { colors } = theme;
  const isGrad = isGradient(colors.background);

  return (
    <div className="flex flex-col gap-1">
      {/* Main background preview */}
      <div
        className="relative h-16 w-full rounded-md overflow-hidden"
        style={
          isGrad
            ? { background: colors.background }
            : { backgroundColor: colors.background }
        }
      >
        {/* Text preview bar */}
        <div
          className="absolute bottom-2 left-2 right-2 h-2 rounded-sm"
          style={{ backgroundColor: colors.text, opacity: 0.6 }}
        />
        {/* Accent bar */}
        <div
          className="absolute top-2 right-2 h-3 w-3 rounded-full"
          style={{ backgroundColor: colors.accent }}
        />
      </div>
      {/* Secondary + card strip */}
      <div className="flex gap-1">
        <div
          className="h-3 flex-1 rounded-sm"
          style={{ backgroundColor: colors.secondary }}
        />
        <div
          className="h-3 flex-1 rounded-sm"
          style={{ backgroundColor: colors.card }}
        />
      </div>
    </div>
  );
}

function AutoOption({
  selected,
  onSelect,
}: {
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3 text-left transition-all hover:border-accent",
        selected
          ? "border-accent bg-accent/5 ring-1 ring-accent"
          : "border-border hover:border-accent/50"
      )}
    >
      {/* Magic wand / AI icon swatch */}
      <div className="flex h-16 w-full items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-indigo-500">
        <svg
          className="size-6 text-white"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"
          />
        </svg>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Auto</span>
        {selected && <Check className="size-4 text-accent" />}
      </div>
      <span className="text-xs text-muted-foreground">
        AI-selected theme
      </span>
    </button>
  );
}

export function ThemePicker({ selectedThemeId, onSelect }: ThemePickerProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {/* Auto option */}
        <AutoOption
          selected={selectedThemeId === "auto"}
          onSelect={() => onSelect("auto")}
        />

        {/* Theme cards */}
        {themes.map((theme) => {
          const isSelected = selectedThemeId === theme.id;
          return (
            <button
              key={theme.id}
              onClick={() => onSelect(theme.id as ThemeId)}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-3 text-left transition-all hover:border-accent",
                isSelected
                  ? "border-accent bg-accent/5 ring-1 ring-accent"
                  : "border-border hover:border-accent/50"
              )}
            >
              <ThemeSwatch theme={theme} />
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium leading-tight">
                  {theme.name}
                </span>
                {isSelected && (
                  <Check className="size-4 flex-shrink-0 text-accent" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type { Theme, ThemeId };
