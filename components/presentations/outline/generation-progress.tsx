'use client'

import React, { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'
import { Loader2Icon } from 'lucide-react'

interface GenerationProgressProps {
  presentationId: string
  onComplete?: () => void
}

type GenerationStage = 'researching' | 'outlining' | 'complete' | 'error'

const STAGE_LABELS: Record<GenerationStage, string> = {
  researching: 'Researching...',
  outlining: 'Generating outline...',
  complete: 'Complete!',
  error: 'Generation failed'
}

export function GenerationProgress({
  presentationId,
  onComplete
}: GenerationProgressProps) {
  const [stage, setStage] = useState<GenerationStage>('researching')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>
    let mounted = true

    const pollStatus = async () => {
      try {
        const response = await fetch(
          `/api/presentations/${presentationId}`,
          {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          }
        )

        if (!response.ok) {
          throw new Error('Failed to fetch status')
        }

        const data = await response.json()

        if (!mounted) return

        if (data.status === 'ready' || data.status === 'draft') {
          setStage('complete')
          clearInterval(intervalId)
          setTimeout(() => {
            if (mounted) onComplete?.()
          }, 1500)
        } else if (data.status === 'error') {
          setStage('error')
          setError(data.error || 'Generation failed')
          clearInterval(intervalId)
        } else if (data.status === 'outline_generating') {
          setStage('outlining')
        }
      } catch (err) {
        if (mounted) {
          setStage('error')
          setError('Failed to check generation status')
        }
      }
    }

    // Initial check
    pollStatus()

    // Poll every 2 seconds
    intervalId = setInterval(pollStatus, 2000)

    return () => {
      mounted = false
      clearInterval(intervalId)
    }
  }, [presentationId, onComplete])

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-lg border',
        stage === 'complete' && 'border-green-500/50 bg-green-500/10',
        stage === 'error' && 'border-destructive/50 bg-destructive/10',
        stage !== 'complete' &&
          stage !== 'error' &&
          'border-primary/20 bg-primary/5'
      )}
    >
      {stage !== 'complete' && stage !== 'error' ? (
        <Loader2Icon className="w-4 h-4 animate-spin text-primary" />
      ) : stage === 'complete' ? (
        <svg
          className="w-4 h-4 text-green-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : (
        <svg
          className="w-4 h-4 text-destructive"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      )}

      <div className="flex-1">
        <p
          className={cn(
            'text-sm font-medium',
            stage === 'error' && 'text-destructive'
          )}
        >
          {STAGE_LABELS[stage]}
        </p>
        {error && <p className="text-xs text-destructive mt-0.5">{error}</p>}
      </div>

      {/* Animated dots for active stages */}
      {stage === 'researching' && (
        <div className="flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
        </div>
      )}
    </div>
  )
}
