'use client'

import React from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

import type { Presentation, PresentationStatus } from '@/lib/presentations/types'
import { STATUS_LABELS } from '@/lib/presentations/types'

interface PresentationCardProps {
  presentation: Presentation
  className?: string
}

// Generate a consistent gradient based on the presentation ID
function getGradientFromId(id: string): string {
  const gradients = [
    'from-blue-500 to-purple-600',
    'from-emerald-500 to-teal-600',
    'from-orange-500 to-red-600',
    'from-pink-500 to-rose-600',
    'from-indigo-500 to-blue-600',
    'from-amber-500 to-orange-600',
    'from-cyan-500 to-blue-600',
    'from-violet-500 to-purple-600'
  ]
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return gradients[hash % gradients.length]
}

function formatTimeAgo(date: Date): string {
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return 'Just now'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`

  return date.toLocaleDateString()
}

function getStatusVariant(status: PresentationStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'ready':
      return 'default'
    case 'draft':
      return 'secondary'
    case 'generating':
    case 'outline_generating':
    case 'slides_generating':
      return 'secondary'
    case 'error':
      return 'destructive'
    default:
      return 'outline'
  }
}

export function PresentationCard({ presentation, className }: PresentationCardProps) {
  const gradient = getGradientFromId(presentation.id)

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-xl border bg-card text-card-foreground overflow-hidden transition-all duration-200 hover:shadow-lg hover:scale-[1.02]',
        className
      )}
    >
      {/* Thumbnail */}
      <div
        className={cn(
          'relative h-40 bg-gradient-to-br transition-opacity',
          gradient
        )}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <svg
            className="w-16 h-16 text-white/30"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 13h6M9 17h4"
            />
          </svg>
        </div>

        {/* Slide count badge */}
        <div className="absolute bottom-2 right-2">
          <span className="px-2 py-1 text-xs font-medium bg-black/40 text-white rounded-md backdrop-blur-sm">
            {presentation.slideCount} slides
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-foreground line-clamp-1">
            {presentation.title}
          </h3>
          <Badge variant={getStatusVariant(presentation.status)}>
            {STATUS_LABELS[presentation.status]}
          </Badge>
        </div>

        <div className="mt-auto space-y-3">
          {/* Meta info */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Edited {formatTimeAgo(presentation.updatedAt)}</span>
            {presentation.style && (
              <>
                <span className="text-border">|</span>
                <span className="capitalize">{presentation.style}</span>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button asChild size="sm" className="flex-1">
              <Link href={`/presentations/${presentation.id}/editor`}>
                Open
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              disabled={presentation.status !== 'ready'}
            >
              <Link href={`/presentations/${presentation.id}/present`}>
                Present
              </Link>
            </Button>
            <Button variant="ghost" size="icon" className="shrink-0">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
