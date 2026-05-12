import { Braces, Brain, Search, Zap } from 'lucide-react'

import { SearchMode } from '@/lib/types/search'

export interface SearchModeConfig {
  value: SearchMode
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}

export const DEFAULT_SEARCH_MODE: SearchMode = 'search'
export const VALID_SEARCH_MODES: SearchMode[] = [
  'quick',
  'search',
  'deep',
  'code'
]

// Centralized search mode configuration
export const SEARCH_MODE_CONFIGS: SearchModeConfig[] = [
  {
    value: 'quick',
    label: 'Quick Answer',
    description: 'Instant answer with minimal tool hops',
    icon: Zap,
    color: 'text-zinc-900'
  },
  {
    value: 'search',
    label: 'Search',
    description: 'Balanced web research with clear citations',
    icon: Search,
    color: 'text-zinc-900'
  },
  {
    value: 'deep',
    label: 'Deep Search',
    description: 'Deep research with comprehensive analysis',
    icon: Brain,
    color: 'text-zinc-900'
  },
  {
    value: 'code',
    label: 'Code',
    description: 'Coding-focused answers and implementation help',
    icon: Braces,
    color: 'text-zinc-900'
  }
]

// Helper function to get a specific mode config
export function getSearchModeConfig(
  mode: SearchMode
): SearchModeConfig | undefined {
  return SEARCH_MODE_CONFIGS.find(config => config.value === mode)
}

export function isSearchMode(
  value: string | null | undefined
): value is SearchMode {
  if (!value) {
    return false
  }

  return VALID_SEARCH_MODES.includes(value as SearchMode)
}

export function normalizeSearchMode(
  value: string | null | undefined
): SearchMode {
  if (value === 'adaptive') {
    return 'deep'
  }

  return isSearchMode(value) ? value : DEFAULT_SEARCH_MODE
}
