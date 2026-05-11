'use client'

import React from 'react'
import Link from 'next/link'

import {
  ArrowRight,
  Download,
  Layers3,
  Play,
  Presentation as PresentationGlyph
} from 'lucide-react'

import type {
  Presentation,
  PresentationStatus
} from '@/lib/presentations/types'
import { STATUS_LABELS } from '@/lib/presentations/types'
import { cn } from '@/lib/utils'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface PresentationCardProps {
  presentation: Presentation
  className?: string
}

// Generate a consistent gradient based on the presentation ID
function getGradientFromId(id: string): string {
  const gradients = [
    'from-blue-500 via-violet-500 to-zinc-950',
    'from-emerald-400 via-teal-500 to-zinc-950',
    'from-orange-400 via-rose-500 to-zinc-950',
    'from-pink-400 via-fuchsia-500 to-zinc-950',
    'from-indigo-400 via-blue-500 to-zinc-950',
    'from-amber-400 via-orange-500 to-zinc-950',
    'from-cyan-400 via-blue-500 to-zinc-950',
    'from-violet-400 via-purple-500 to-zinc-950'
  ]
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return gradients[hash % gradients.length]
}

function formatTimeAgo(date: Date): string {
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return 'Just now'
  if (diffInSeconds < 3600)
    return `${Math.floor(diffInSeconds / 60)} minutes ago`
  if (diffInSeconds < 86400)
    return `${Math.floor(diffInSeconds / 3600)} hours ago`
  if (diffInSeconds < 604800)
    return `${Math.floor(diffInSeconds / 86400)} days ago`

  return date.toLocaleDateString()
}

function getStatusVariant(
  status: PresentationStatus
): 'default' | 'secondary' | 'destructive' | 'outline' {
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

export function PresentationCard({
  presentation,
  className
}: PresentationCardProps) {
  const gradient = getGradientFromId(presentation.id)

  return (
    <div
      className={cn(
        'surface-card group relative flex flex-col overflow-hidden',
        className
      )}
    >
      <div
        className={cn(
          'relative h-44 overflow-hidden bg-gradient-to-br transition-opacity',
          gradient
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.34),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(0,0,0,0.22))]" />
        <div className="absolute left-4 right-4 top-4 rounded-2xl border border-white/18 bg-white/12 p-3 text-white shadow-2xl backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/75">
              <PresentationGlyph className="size-3.5" />
              Brok deck
            </span>
            <span className="h-2 w-10 rounded-full bg-white/25" />
          </div>
          <div className="mt-6 space-y-2.5">
            <div className="h-2.5 w-20 rounded-full bg-white/45" />
            <div className="h-5 w-4/5 rounded-xl bg-white/90" />
            <div className="h-5 w-3/5 rounded-xl bg-white/70" />
            <div className="grid grid-cols-3 gap-2 pt-4">
              <div className="h-8 rounded-xl bg-white/16" />
              <div className="h-8 rounded-xl bg-white/22" />
              <div className="h-8 rounded-xl bg-white/14" />
            </div>
          </div>
        </div>

        <div className="absolute bottom-3 right-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-black/35 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
            <Layers3 className="size-3.5" />
            {presentation.slideCount} slides
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 font-semibold text-zinc-950">
            {presentation.title}
          </h3>
          <Badge
            variant={getStatusVariant(presentation.status)}
            className="rounded-full text-[11px]"
          >
            {STATUS_LABELS[presentation.status]}
          </Badge>
        </div>

        <div className="mt-auto space-y-3">
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span>Edited {formatTimeAgo(presentation.updatedAt)}</span>
            {presentation.style && (
              <>
                <span className="text-zinc-300">|</span>
                <span className="capitalize">{presentation.style}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              asChild
              size="sm"
              className="clicky-control flex-1 rounded-xl bg-zinc-950 text-white hover:bg-zinc-800"
            >
              <Link href={`/presentations/${presentation.id}/editor`}>
                Open
                <ArrowRight className="ml-2 size-3.5" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="clicky-control rounded-xl border-zinc-200 bg-white/80"
              disabled={presentation.status !== 'ready'}
            >
              <Link href={`/presentations/${presentation.id}/present`}>
                <Play className="mr-1.5 size-3.5" />
                Present
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="clicky-control size-9 shrink-0 rounded-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"
            >
              <Download className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
