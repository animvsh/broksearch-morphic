'use client'

import { useSyncExternalStore } from 'react'

import {
  DEFAULT_SEARCH_MODE,
  normalizeSearchMode,
  SEARCH_MODE_CONFIGS
} from '@/lib/config/search-modes'
import { SearchMode } from '@/lib/types/search'
import { getCookie, subscribeToCookieChange } from '@/lib/utils/cookies'

export function useSearchMode() {
  const value = useSyncExternalStore(
    subscribeToCookieChange,
    () => normalizeSearchMode(getCookie('searchMode')),
    () => DEFAULT_SEARCH_MODE
  )

  const selectedMode =
    SEARCH_MODE_CONFIGS.find(config => config.value === value) ??
    SEARCH_MODE_CONFIGS.find(config => config.value === DEFAULT_SEARCH_MODE)

  return {
    value: value as SearchMode,
    selectedMode
  }
}
