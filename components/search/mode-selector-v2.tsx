'use client'

import { Braces, Brain, Search, Zap } from 'lucide-react'

import type { SearchMode } from '@/lib/types/search'
import { cn } from '@/lib/utils'

export interface ModeOption {
  value: SearchMode
  label: string
  shortLabel: string
  description: string
  estimatedTime: string
  icon: React.ComponentType<{ className?: string }>
  accent: string
}

export const MODE_OPTIONS: ModeOption[] = [
  {
    value: 'quick',
    label: 'Quick',
    shortLabel: 'Quick',
    description: 'Fast web-backed answer with minimal tool hops.',
    estimatedTime: '~5s',
    icon: Zap,
    accent: 'from-amber-500/15 to-amber-500/0'
  },
  {
    value: 'search',
    label: 'Search',
    shortLabel: 'Search',
    description: 'Balanced research with clear citations and sources.',
    estimatedTime: '~12s',
    icon: Search,
    accent: 'from-sky-500/15 to-sky-500/0'
  },
  {
    value: 'deep',
    label: 'Deep Research',
    shortLabel: 'Deep',
    description: 'Longer run: broader search, source reading, synthesis.',
    estimatedTime: '~45s',
    icon: Brain,
    accent: 'from-violet-500/15 to-violet-500/0'
  },
  {
    value: 'code',
    label: 'Code',
    shortLabel: 'Code',
    description: 'Coding-focused answers and implementation help.',
    estimatedTime: '~10s',
    icon: Braces,
    accent: 'from-emerald-500/15 to-emerald-500/0'
  }
]

interface ModeSelectorV2Props {
  value: SearchMode
  onChange: (mode: SearchMode) => void
  size?: 'sm' | 'md' | 'lg'
  layout?: 'pills' | 'cards'
  disabled?: boolean
  className?: string
}

export function ModeSelectorV2({
  value,
  onChange,
  size = 'md',
  layout = 'pills',
  disabled = false,
  className
}: ModeSelectorV2Props) {
  if (layout === 'cards') {
    return (
      <ModeCards
        value={value}
        onChange={onChange}
        size={size}
        disabled={disabled}
        className={className}
      />
    )
  }
  return (
    <ModePills
      value={value}
      onChange={onChange}
      size={size}
      disabled={disabled}
      className={className}
    />
  )
}

function ModePills({
  value,
  onChange,
  size,
  disabled,
  className
}: Omit<ModeSelectorV2Props, 'layout'>) {
  const isCompact = size === 'sm'
  return (
    <div
      role="tablist"
      aria-label="Search mode"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 p-1 shadow-sm backdrop-blur',
        className
      )}
    >
      {MODE_OPTIONS.map(opt => {
        const active = opt.value === value
        const Icon = opt.icon
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'group relative inline-flex items-center gap-1.5 rounded-full font-medium transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              isCompact
                ? 'h-11 min-h-11 min-w-[2.95rem] px-2.5 text-[11px]'
                : 'h-9 px-3.5 text-sm',
              active
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span
              className={cn(
                'absolute inset-0 rounded-full transition-all duration-200',
                active
                  ? 'bg-foreground/5 ring-1 ring-foreground/10'
                  : 'bg-transparent ring-0'
              )}
            />
            <Icon
              className={cn(
                'relative z-10 transition-colors',
                isCompact ? 'size-3.5' : 'size-4',
                active && 'text-foreground'
              )}
            />
            <span className="relative z-10 whitespace-nowrap">
              {opt.shortLabel}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function ModeCards({
  value,
  onChange,
  size,
  disabled,
  className
}: Omit<ModeSelectorV2Props, 'layout'>) {
  return (
    <div
      className={cn(
        'grid gap-3',
        size === 'lg'
          ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
          : 'grid-cols-2 sm:grid-cols-4',
        className
      )}
    >
      {MODE_OPTIONS.map(opt => {
        const active = opt.value === value
        const Icon = opt.icon
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'group relative overflow-hidden rounded-2xl border bg-card p-4 text-left transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              active
                ? 'border-foreground/20 shadow-md'
                : 'border-border/60 hover:border-foreground/15 hover:shadow-sm'
            )}
          >
            <div
              className={cn(
                'absolute inset-0 bg-gradient-to-br transition-opacity duration-300',
                opt.accent,
                active ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'
              )}
            />
            {active && (
              <div className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-foreground/30" />
            )}
            <div className="relative flex items-start justify-between gap-2">
              <div
                className={cn(
                  'inline-flex size-9 items-center justify-center rounded-xl bg-foreground/5 text-foreground transition-transform duration-200',
                  active && 'scale-110'
                )}
              >
                <Icon className="size-4" />
              </div>
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {opt.estimatedTime}
              </span>
            </div>
            <div className="relative mt-3">
              <div className="text-sm font-semibold">{opt.label}</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {opt.description}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

interface ModeDescriptionProps {
  mode: SearchMode
  className?: string
}

export function ModeDescription({ mode, className }: ModeDescriptionProps) {
  const opt = MODE_OPTIONS.find(o => o.value === mode)
  if (!opt) return null
  const Icon = opt.icon
  return (
    <div
      key={mode}
      className={cn(
        'flex items-center gap-2 text-xs text-muted-foreground',
        className
      )}
    >
      <Icon className="size-3.5" />
      <span>{opt.description}</span>
      <span className="text-muted-foreground/50">·</span>
      <span>{opt.estimatedTime}</span>
    </div>
  )
}
