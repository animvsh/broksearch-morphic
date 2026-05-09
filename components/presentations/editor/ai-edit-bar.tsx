'use client'

import React, { useCallback, useRef, useState } from 'react'
import { Send, Sparkles, ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { usePresentationEditorStore } from '@/states/presentation-editor-store'

// ---------------------------------------------------------------------------
// Example prompts for the AI edit bar
// ---------------------------------------------------------------------------

const EXAMPLE_PROMPTS = [
  'Make the title larger and change the font to bold',
  'Add three more bullet points to this slide',
  'Change the background to a dark theme',
  'Make the text color more readable',
  'Add an accent bar on the left side',
  'Convert this to a two-column layout',
  'Make the quote larger and add attribution',
  'Add a call-to-action at the bottom',
]

// ---------------------------------------------------------------------------
// Main AIEditBar component
// ---------------------------------------------------------------------------

export function AIEditBar() {
  const { presentationId, isGenerating, setIsGenerating, setSlides, slides } =
    usePresentationEditorStore()

  const [inputValue, setInputValue] = useState('')
  const [showExamples, setShowExamples] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = useCallback(async () => {
    if (!inputValue.trim() || isGenerating) return

    const prompt = inputValue.trim()
    setInputValue('')
    setIsGenerating(true)

    try {
      const response = await fetch(
        `/api/presentations/${presentationId}/edit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt,
            slides,
          }),
        }
      )

      if (!response.ok) {
        throw new Error('Failed to edit presentation')
      }

      const data = await response.json()

      if (data.slides) {
        setSlides(data.slides)
      }
    } catch (error) {
      console.error('Error editing presentation:', error)
      // In a real app, show an error toast here
      setInputValue(prompt) // Restore the input on error
    } finally {
      setIsGenerating(false)
    }
  }, [inputValue, isGenerating, presentationId, slides, setIsGenerating, setSlides])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const handleExampleSelect = useCallback((example: string) => {
    setInputValue(example)
    setShowExamples(false)
    textareaRef.current?.focus()
  }, [])

  return (
    <div className="h-full flex items-center gap-3 px-4 py-3 bg-sidebar dark:bg-sidebar border-t border-border">
      {/* Examples dropdown */}
      <DropdownMenu open={showExamples} onOpenChange={setShowExamples}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
            <Sparkles className="size-4" />
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-80">
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Example prompts
          </div>
          {EXAMPLE_PROMPTS.map((example, index) => (
            <DropdownMenuItem
              key={index}
              onSelect={() => handleExampleSelect(example)}
              className="cursor-pointer"
            >
              {example}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Input field */}
      <div className="flex-1 relative">
        <Textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Brok to edit this deck... (Ctrl+Enter to submit)"
          className={cn(
            'min-h-[44px] max-h-[120px] resize-none pr-12',
            'bg-background border-input focus-visible:ring-1'
          )}
          disabled={isGenerating}
        />

        {/* Submit button */}
        <Button
          size="icon"
          variant="ghost"
          onClick={handleSubmit}
          disabled={!inputValue.trim() || isGenerating}
          className="absolute right-2 bottom-2 h-7 w-7"
        >
          {isGenerating ? (
            <Spinner className="size-4" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>

      {/* Keyboard hint */}
      <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
        <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">Ctrl</kbd>
        <span>+</span>
        <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">Enter</kbd>
      </div>
    </div>
  )
}
