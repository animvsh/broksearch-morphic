"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { type SlideContent } from "@/lib/presentations/theme-utils";
import { type Theme } from "@/lib/presentations/themes";

import { PresentationNav } from "./presentation-nav";
import { SlideRenderer } from "./slide-renderer";
import { SpeakerNotes } from "./speaker-notes";

interface PresentationModeProps {
  slides: SlideContent[];
  theme: Theme;
  presentationId: string;
}

export function PresentationMode({
  slides,
  theme,
  presentationId,
}: PresentationModeProps) {
  const router = useRouter();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Timer
  // ---------------------------------------------------------------------------
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Fullscreen
  // ---------------------------------------------------------------------------
  const enterFullscreen = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } catch {
      // Fullscreen may not be supported or allowed
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setIsFullscreen(false);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }, [enterFullscreen, exitFullscreen]);

  // Track fullscreen changes via API
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Enter fullscreen on mount
  useEffect(() => {
    enterFullscreen();
    return () => {
      exitFullscreen();
    };
  }, [enterFullscreen, exitFullscreen]);

  // ---------------------------------------------------------------------------
  // Exit presentation (defined before useEffect to satisfy lint rule)
  // ---------------------------------------------------------------------------
  const exitPresentation = useCallback(() => {
    exitFullscreen();
    router.push(`/presentations/${presentationId}/editor`);
  }, [exitFullscreen, router, presentationId]);

  // ---------------------------------------------------------------------------
  // Keyboard navigation
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowRight":
        case " ":
          e.preventDefault();
          setCurrentSlide((s) => Math.min(s + 1, slides.length - 1));
          break;
        case "ArrowLeft":
          e.preventDefault();
          setCurrentSlide((s) => Math.max(s - 1, 0));
          break;
        case "Escape":
          e.preventDefault();
          exitPresentation();
          break;
        case "f":
        case "F":
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            toggleFullscreen();
          }
          break;
        case "n":
        case "N":
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            setShowNotes((v) => !v);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [slides.length, toggleFullscreen, exitPresentation]);

  // ---------------------------------------------------------------------------
  // Touch / swipe navigation
  // ---------------------------------------------------------------------------
  const touchStartX = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const threshold = 50;
    if (deltaX < -threshold) {
      // Swipe left → next
      setCurrentSlide((s) => Math.min(s + 1, slides.length - 1));
    } else if (deltaX > threshold) {
      // Swipe right → prev
      setCurrentSlide((s) => Math.max(s - 1, 0));
    }
    touchStartX.current = null;
  };

  // ---------------------------------------------------------------------------
  // Current slide data
  // ---------------------------------------------------------------------------
  const slide = slides[currentSlide];
  const speakerNotes = slide?.speakerNotes ?? "";

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 overflow-hidden"
      style={
        theme.colors.background.startsWith("linear-gradient")
          ? { background: theme.colors.background }
          : { backgroundColor: theme.colors.background }
      }
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Slide */}
      {slide && (
        <SlideRenderer
          key={slide.id}
          slide={slide}
          theme={theme}
          isActive={true}
        />
      )}

      {/* Navigation */}
      <PresentationNav
        currentSlide={currentSlide}
        totalSlides={slides.length}
        elapsedSeconds={elapsedSeconds}
        onPrev={() => setCurrentSlide((s) => Math.max(s - 1, 0))}
        onNext={() => setCurrentSlide((s) => Math.min(s + 1, slides.length - 1))}
        onExit={exitPresentation}
        onToggleFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
      />

      {/* Speaker notes panel */}
      <SpeakerNotes
        notes={speakerNotes}
        isOpen={showNotes}
        onClose={() => setShowNotes(false)}
      />

      {/* Notes toggle hint */}
      <div className="fixed right-4 top-4 z-40">
        <button
          onClick={() => setShowNotes((v) => !v)}
          className="rounded-md bg-black/30 px-3 py-1.5 text-xs text-white/60 backdrop-blur-sm transition-colors hover:bg-black/50 hover:text-white"
          aria-label="Toggle speaker notes"
        >
          Press N for notes
        </button>
      </div>
    </div>
  );
}
