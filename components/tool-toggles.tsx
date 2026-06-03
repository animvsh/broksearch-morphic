'use client'

import { useEffect, useState } from 'react'

import {
  Code2,
  Eye,
  Globe,
  Search,
  Sparkles,
  Wrench
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { getCookie, setCookie } from '@/lib/utils/cookies'

export type ToolTogglesState = {
  search: boolean
  browse: boolean
  code: boolean
  agent: boolean
}

const DEFAULT_TOGGLES: ToolTogglesState = {
  search: true,
  browse: true,
  code: true,
  agent: false
}

const COOKIE_NAME = 'brokToolToggles'
const STORAGE_KEY = 'brok:tool-toggles'

interface ToolToggle {
  key: keyof ToolTogglesState
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}

const TOOL_TOGGLES: ToolToggle[] = [
  {
    key: 'search',
    label: 'Search',
    description: 'Run web search and cite sources',
    icon: Search,
    color: 'text-sky-600'
  },
  {
    key: 'browse',
    label: 'Browse',
    description: 'Fetch and read pages in real time',
    icon: Globe,
    color: 'text-emerald-600'
  },
  {
    key: 'code',
    label: 'Code',
    description: 'Generate, run, and explain code',
    icon: Code2,
    color: 'text-violet-600'
  },
  {
    key: 'agent',
    label: 'Agent',
    description: 'Plan multi-step tasks automatically',
    icon: Sparkles,
    color: 'text-amber-600'
  }
]

interface ToolTogglesProps {
  className?: string
  onChange?: (state: ToolTogglesState) => void
}

/**
 * Tool toggles (PRD section 18 — Brok Chat tools).
 *
 * Persists the selection in a cookie + localStorage so the choice survives
 * reloads, and emits change events for the parent chat panel to forward to
 * the model.
 */
export function ToolToggles({ className, onChange }: ToolTogglesProps) {
  const [state, setState] = useState<ToolTogglesState>(() => {
    if (typeof window === 'undefined') return DEFAULT_TOGGLES
    let parsed: Partial<ToolTogglesState> | null = null
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        parsed = JSON.parse(raw) as Partial<ToolTogglesState>
      }
    } catch {
      parsed = null
    }
    if (!parsed) {
      const cookieValue = getCookie(COOKIE_NAME)
      if (cookieValue) {
        try {
          parsed = JSON.parse(cookieValue) as Partial<ToolTogglesState>
        } catch {
          parsed = null
        }
      }
    }
    return parsed ? { ...DEFAULT_TOGGLES, ...parsed } : DEFAULT_TOGGLES
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // ignore quota errors
    }
    setCookie(COOKIE_NAME, JSON.stringify(state))
    onChange?.(state)
  }, [state, onChange])

  const toggle = (key: keyof ToolTogglesState) => {
    setState(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1.5 rounded-full border border-zinc-200/80 bg-white/70 p-1 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.18)] backdrop-blur',
        className
      )}
      role="group"
      aria-label="Tool toggles"
      data-testid="tool-toggles"
    >
      <Wrench className="ml-1.5 size-3.5 text-zinc-400" aria-hidden />
      {TOOL_TOGGLES.map(toggle_ => {
        const Icon = toggle_.icon
        const isActive = state[toggle_.key]
        return (
          <button
            key={toggle_.key}
            type="button"
            onClick={() => toggle(toggle_.key)}
            aria-pressed={isActive}
            title={toggle_.description}
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-colors',
              isActive
                ? cn('bg-zinc-950 text-white shadow-sm', toggle_.color, 'bg-opacity-90')
                : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700'
            )}
            data-testid={`tool-toggle-${toggle_.key}`}
          >
            <Icon
              className={cn(
                'size-3',
                isActive ? 'text-white' : toggle_.color
              )}
            />
            <span>{toggle_.label}</span>
            {toggle_.key === 'browse' && isActive ? (
              <Eye className="size-3 text-white/80" />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
