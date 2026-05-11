'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

import { Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'

interface ExamplePrompt {
  text: string
  label: string
}

const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  {
    text: 'Create a pitch deck for Brok, a cheaper Perplexity alternative.',
    label: 'Pitch Deck'
  },
  {
    text: 'Make a 10-slide class presentation about TCP congestion control',
    label: 'Class Presentation'
  },
  {
    text: 'Create a sales deck for an AI app builder',
    label: 'Sales Deck'
  }
]

const MAX_CHARS = 500

interface PromptBoxProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  isLoading?: boolean
  className?: string
}

export function PromptBox({
  value,
  onChange,
  onSubmit,
  isLoading = false,
  className
}: PromptBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 300)}px`
    }
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [value, adjustHeight])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault()
      if (value.trim() && !isLoading) {
        onSubmit()
      }
    }
  }

  const handleExampleClick = (example: ExamplePrompt) => {
    onChange(example.text)
    textareaRef.current?.focus()
  }

  const charCount = value.length
  const isOverLimit = charCount > MAX_CHARS

  return (
    <div className={cn('space-y-4', className)}>
      {/* Textarea */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What presentation do you want to create?"
          disabled={isLoading}
          rows={4}
          className={cn(
            'w-full resize-none rounded-xl border bg-card px-4 py-3 text-base',
            'placeholder:text-muted-foreground',
            'focus:outline-hidden focus:ring-2 focus:ring-ring/50 focus:border-accent',
            'transition-all duration-200',
            isLoading && 'opacity-50 cursor-not-allowed',
            isOverLimit && 'border-destructive focus:ring-destructive/50'
          )}
          style={{ minHeight: '120px' }}
        />

        {/* Character counter */}
        <div
          className={cn(
            'absolute bottom-3 right-3 text-xs',
            isOverLimit ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {charCount}/{MAX_CHARS}
        </div>
      </div>

      {/* Examples */}
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Try an example:</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map(example => (
            <button
              key={example.label}
              onClick={() => handleExampleClick(example)}
              disabled={isLoading}
              className={cn(
                'px-3 py-1.5 text-sm rounded-full border',
                'bg-secondary/50 text-secondary-foreground',
                'hover:bg-secondary hover:text-secondary-foreground',
                'transition-colors duration-150',
                'focus:outline-hidden focus:ring-2 focus:ring-ring/50',
                isLoading && 'opacity-50 cursor-not-allowed'
              )}
            >
              {example.label}
            </button>
          ))}
        </div>
      </div>

      {/* Submit hint */}
      <p className="text-xs text-muted-foreground">
        Press{' '}
        <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">
          Ctrl
        </kbd>{' '}
        +{' '}
        <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">
          Enter
        </kbd>{' '}
        to generate
      </p>
    </div>
  )
}
