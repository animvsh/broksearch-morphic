'use client'

import * as React from 'react'

export type Theme = 'dark' | 'light' | 'system'

type ThemeProviderProps = {
  children: React.ReactNode
  attribute?: 'class' | `data-${string}`
  defaultTheme?: Theme
  enableSystem?: boolean
  enableColorScheme?: boolean
  disableTransitionOnChange?: boolean
  storageKey?: string
}

type ThemeContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: 'dark' | 'light'
  systemTheme: 'dark' | 'light'
  themes: Theme[]
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

function getSystemTheme() {
  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark'
  }

  return 'light'
}

function applyTheme(
  theme: Theme,
  systemTheme: 'dark' | 'light',
  attribute: ThemeProviderProps['attribute'],
  enableColorScheme: boolean
) {
  const resolvedTheme = theme === 'system' ? systemTheme : theme
  const root = document.documentElement

  if (attribute === 'class') {
    root.classList.remove('light', 'dark')
    root.classList.add(resolvedTheme)
  } else if (attribute) {
    root.setAttribute(attribute, resolvedTheme)
  }

  if (enableColorScheme) {
    root.style.colorScheme = resolvedTheme
  }
}

export function ThemeProvider({
  children,
  attribute = 'class',
  defaultTheme = 'system',
  enableSystem = true,
  enableColorScheme = true,
  storageKey = 'theme'
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme)
  const [systemTheme, setSystemTheme] = React.useState<'dark' | 'light'>('light')

  React.useEffect(() => {
    const storedTheme = window.localStorage.getItem(storageKey) as Theme | null
    if (
      storedTheme === 'dark' ||
      storedTheme === 'light' ||
      (enableSystem && storedTheme === 'system')
    ) {
      setThemeState(storedTheme)
    }

    setSystemTheme(getSystemTheme())
  }, [enableSystem, storageKey])

  React.useEffect(() => {
    applyTheme(theme, systemTheme, attribute, enableColorScheme)
  }, [attribute, enableColorScheme, systemTheme, theme])

  React.useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemTheme = () => setSystemTheme(getSystemTheme())

    media.addEventListener('change', updateSystemTheme)
    return () => media.removeEventListener('change', updateSystemTheme)
  }, [])

  React.useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return

      const nextTheme = event.newValue as Theme | null
      if (
        nextTheme === 'dark' ||
        nextTheme === 'light' ||
        (enableSystem && nextTheme === 'system')
      ) {
        setThemeState(nextTheme)
      } else {
        setThemeState(defaultTheme)
      }
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [defaultTheme, enableSystem, storageKey])

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      setThemeState(nextTheme)
      window.localStorage.setItem(storageKey, nextTheme)
    },
    [storageKey]
  )

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      resolvedTheme: theme === 'system' ? systemTheme : theme,
      systemTheme,
      themes: enableSystem ? ['light', 'dark', 'system'] : ['light', 'dark']
    }),
    [enableSystem, setTheme, systemTheme, theme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = React.useContext(ThemeContext)

  if (!context) {
    return {
      theme: 'system' as Theme,
      setTheme: () => {},
      resolvedTheme: 'light' as const,
      systemTheme: 'light' as const,
      themes: ['light', 'dark', 'system'] as Theme[]
    }
  }

  return context
}
