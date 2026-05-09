"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ChevronLeft, ChevronRight, Maximize2, Minimize2,X } from "lucide-react";

import { cn } from "@/lib/utils";

interface PresentationNavProps {
  currentSlide: number;
  totalSlides: number;
  elapsedSeconds: number;
  onPrev: () => void;
  onNext: () => void;
  onExit: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function PresentationNav({
  currentSlide,
  totalSlides,
  elapsedSeconds,
  onPrev,
  onNext,
  onExit,
  onToggleFullscreen,
  isFullscreen,
}: PresentationNavProps) {
  const [visible, setVisible] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-hide nav after inactivity
  const resetInactivityTimer = useCallback(() => {
    setVisible(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setVisible(false);
    }, 2000);
  }, []);

   
  useLayoutEffect(() => {
    // Defer the initial timer setup to avoid setState during render
    const timeoutId = setTimeout(() => {
      resetInactivityTimer();
    }, 0);

    const handleMouseMove = () => resetInactivityTimer();
    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      clearTimeout(timeoutId);
    };

  }, [resetInactivityTimer]);

  return (
    <>
      {/* Left click zone — prev */}
      <button
        onClick={onPrev}
        disabled={currentSlide === 0}
        className={cn(
          "fixed left-0 top-0 z-40 flex h-full w-1/4 items-center justify-start pl-4 transition-opacity duration-200",
          "disabled:cursor-not-allowed disabled:opacity-0",
          "opacity-0 hover:opacity-100 focus:opacity-100",
          "bg-gradient-to-r from-black/20 to-transparent"
        )}
        style={{ opacity: visible ? undefined : 0 }}
        aria-label="Previous slide"
      >
        <div
          className={cn(
            "rounded-full bg-black/40 p-3 text-white backdrop-blur-sm transition-transform hover:scale-110",
            currentSlide === 0 && "opacity-30"
          )}
        >
          <ChevronLeft className="size-8" />
        </div>
      </button>

      {/* Right click zone — next */}
      <button
        onClick={onNext}
        disabled={currentSlide === totalSlides - 1}
        className={cn(
          "fixed right-0 top-0 z-40 flex h-full w-1/4 items-center justify-end pr-4 transition-opacity duration-200",
          "disabled:cursor-not-allowed disabled:opacity-0",
          "opacity-0 hover:opacity-100 focus:opacity-100",
          "bg-gradient-to-l from-black/20 to-transparent"
        )}
        style={{ opacity: visible ? undefined : 0 }}
        aria-label="Next slide"
      >
        <div
          className={cn(
            "rounded-full bg-black/40 p-3 text-white backdrop-blur-sm transition-transform hover:scale-110",
            currentSlide === totalSlides - 1 && "opacity-30"
          )}
        >
          <ChevronRight className="size-8" />
        </div>
      </button>

      {/* Bottom nav bar */}
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-40 transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0"
        )}
      >
        {/* Gradient fade */}
        <div className="h-24 bg-gradient-to-t from-black/60 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-8 pb-6">
          {/* Left: Exit + fullscreen */}
          <div className="flex items-center gap-2">
            <button
              onClick={onExit}
              className="rounded-md bg-black/40 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
              aria-label="Exit presentation"
            >
              <X className="size-5" />
            </button>
            <button
              onClick={onToggleFullscreen}
              className="rounded-md bg-black/40 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen ? (
                <Minimize2 className="size-5" />
              ) : (
                <Maximize2 className="size-5" />
              )}
            </button>
          </div>

          {/* Center: Progress dots */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSlides }).map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  // Jump to slide — handled by parent via keyboard or direct nav
                }}
                className={cn(
                  "h-2 rounded-full transition-all duration-200",
                  i === currentSlide
                    ? "w-6 bg-white"
                    : i < currentSlide
                    ? "w-2 bg-white/50"
                    : "w-2 bg-white/30"
                )}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>

          {/* Right: Slide count + timer */}
          <div className="flex items-center gap-4 font-mono text-sm text-white/80">
            <span>
              Slide {currentSlide + 1} of {totalSlides}
            </span>
            <span className="rounded bg-black/40 px-2 py-1 backdrop-blur-sm">
              {formatTime(elapsedSeconds)}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
