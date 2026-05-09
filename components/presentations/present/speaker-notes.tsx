"use client";

import { useEffect, useRef } from "react";

import { X } from "lucide-react";

import { cn } from "@/lib/utils";

interface SpeakerNotesProps {
  notes: string;
  isOpen: boolean;
  onClose: () => void;
}

export function SpeakerNotes({ notes, isOpen, onClose }: SpeakerNotesProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus trap and escape handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out",
        isOpen ? "translate-y-0" : "translate-y-full"
      )}
    >
      {/* Overlay backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Speaker Notes"
        className="relative mx-auto max-w-4xl rounded-t-xl bg-neutral-900 p-6 text-white shadow-2xl"
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
            Speaker Notes
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
            aria-label="Close speaker notes"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Notes content */}
        <div className="max-h-64 overflow-y-auto">
          {notes ? (
            <p className="whitespace-pre-wrap text-lg leading-relaxed text-neutral-200">
              {notes}
            </p>
          ) : (
            <p className="text-neutral-500 italic">No speaker notes for this slide.</p>
          )}
        </div>

        {/* Hint */}
        <div className="mt-4 text-center">
          <span className="text-xs text-neutral-600">
            Press <kbd className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-400">N</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
