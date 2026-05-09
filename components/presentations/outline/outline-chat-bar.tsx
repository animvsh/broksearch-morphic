'use client'

import React, { useState } from 'react'

import { Loader2Icon,SendIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface OutlineChatBarProps {
  presentationId: string
  onOutlineUpdated?: () => void
}

const EXAMPLE_PROMPTS = [
  'make this more investor focused',
  'add a market size slide',
  'remove slide 3',
  'shorten the executive summary'
]

export function OutlineChatBar({
  presentationId,
  onOutlineUpdated
}: OutlineChatBarProps) {
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!message.trim() || isLoading) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/presentations/${presentationId}/edit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: message.trim() })
        }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to edit outline')
      }

      setMessage('')
      onOutlineUpdated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to edit outline')
    } finally {
      setIsLoading(false)
    }
  }

  const handleExampleClick = (example: string) => {
    setMessage(example)
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="relative">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask to edit your outline..."
          disabled={isLoading}
          className={cn(
            'pr-20',
            error && 'border-destructive focus-visible:ring-destructive'
          )}
        />
        <Button
          type="submit"
          size="sm"
          disabled={!message.trim() || isLoading}
          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 px-3"
        >
          {isLoading ? (
            <Loader2Icon className="w-4 h-4 animate-spin" />
          ) : (
            <SendIcon className="w-4 h-4" />
          )}
        </Button>
      </form>

      {/* Error message */}
      {error && (
        <p className="text-xs text-destructive px-1">{error}</p>
      )}

      {/* Example prompts */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-muted-foreground">Try:</span>
        {EXAMPLE_PROMPTS.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => handleExampleClick(example)}
            disabled={isLoading}
            className="text-xs px-2 py-1 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  )
}
