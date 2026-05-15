'use client'

import { toast } from 'sonner'

import {
  normalizeSearchMode,
  VALID_SEARCH_MODES
} from '@/lib/config/search-modes'
import { SHORTCUT_EVENTS, SHORTCUTS } from '@/lib/keyboard-shortcuts'
import { SearchMode } from '@/lib/types/search'
import { getCookie, setCookie } from '@/lib/utils/cookies'

import { useKeyboardShortcut } from '@/hooks/use-keyboard-shortcut'

import { useSidebar } from './ui/sidebar'
import { KeyboardShortcutDialog } from './keyboard-shortcut-dialog'
import { Theme, useTheme } from './theme-provider'

const THEME_CYCLE: Record<Theme, Theme> = {
  dark: 'light',
  light: 'system',
  system: 'dark'
}

const SEARCH_MODE_LABELS: Record<SearchMode, string> = {
  quick: 'Quick',
  search: 'Search',
  deep: 'Deep Research',
  code: 'Code'
}

export function KeyboardShortcutHandler() {
  const { theme, setTheme } = useTheme()
  const { toggleSidebar } = useSidebar()

  useKeyboardShortcut(SHORTCUTS.toggleSidebar, toggleSidebar)

  useKeyboardShortcut(SHORTCUTS.newChat, () => {
    window.dispatchEvent(
      new CustomEvent(SHORTCUT_EVENTS.newChat, { cancelable: true })
    )
  })

  useKeyboardShortcut(SHORTCUTS.toggleTheme, () => {
    setTheme(THEME_CYCLE[theme ?? 'system'] ?? 'dark')
  })

  useKeyboardShortcut(SHORTCUTS.copyMessage, () => {
    window.dispatchEvent(
      new CustomEvent(SHORTCUT_EVENTS.copyMessage, { cancelable: true })
    )
  })

  useKeyboardShortcut(SHORTCUTS.toggleSearchMode, () => {
    const current = normalizeSearchMode(getCookie('searchMode'))
    const index = VALID_SEARCH_MODES.indexOf(current)
    const next =
      VALID_SEARCH_MODES[(index + 1) % VALID_SEARCH_MODES.length] ?? 'quick'
    setCookie('searchMode', next)
    toast.info(`Search mode: ${SEARCH_MODE_LABELS[next]}`)
  })

  useKeyboardShortcut(SHORTCUTS.showShortcuts, () => {
    window.dispatchEvent(new CustomEvent(SHORTCUT_EVENTS.showShortcuts))
  })

  return <KeyboardShortcutDialog />
}
