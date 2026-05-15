'use client'

import { useEffect, useState } from 'react'

import { Check, ChevronDown } from 'lucide-react'

import {
  DEFAULT_SEARCH_MODE,
  normalizeSearchMode,
  SEARCH_MODE_CONFIGS
} from '@/lib/config/search-modes'
import { SearchMode } from '@/lib/types/search'
import { cn } from '@/lib/utils'
import { getCookie, setCookie } from '@/lib/utils/cookies'

import { useSearchMode } from '@/hooks/use-search-mode'

import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from './ui/dropdown-menu'
import { HoverCard, HoverCardContent, HoverCardTrigger } from './ui/hover-card'

export function SearchModeSelector() {
  const visibleModeConfigs = SEARCH_MODE_CONFIGS.filter(
    config => config.value !== 'code'
  )
  const { value, selectedMode } = useSearchMode()
  const [openHoverCard, setOpenHoverCard] = useState<string | null>(null)
  const [justSelected, setJustSelected] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  useEffect(() => {
    const savedMode = getCookie('searchMode')
    const normalizedMode = normalizeSearchMode(savedMode)
    const hasMigratedDefault = getCookie('searchModeDefaultMigrated') === 'true'
    if (!hasMigratedDefault && !savedMode) {
      setCookie('searchMode', DEFAULT_SEARCH_MODE)
      setCookie('searchModeDefaultMigrated', 'true')
      return
    }
    if (normalizedMode === 'code') {
      setCookie('searchMode', DEFAULT_SEARCH_MODE)
      return
    }
    if (savedMode !== normalizedMode) {
      setCookie('searchMode', normalizedMode)
    }
  }, [])

  const handleModeSelect = (mode: SearchMode) => {
    setCookie('searchMode', mode)
    setOpenHoverCard(null) // Close hover card on selection
    setDropdownOpen(false) // Close dropdown on selection
    setJustSelected(true)

    // Prevent hover card from reopening immediately
    setTimeout(() => {
      setJustSelected(false)
    }, 500)
  }

  const SelectedIcon = selectedMode?.icon
  const selectedIndex = Math.max(
    visibleModeConfigs.findIndex(config => config.value === value),
    0
  )
  const modeCount = visibleModeConfigs.length

  return (
    <>
      {/* Mobile Dropdown */}
      <div className="sm:hidden">
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-1 rounded-full text-xs shadow-none transition-all"
            >
              {SelectedIcon && (
                <SelectedIcon
                  className={cn(
                    'size-3.5 transition-colors',
                    selectedMode?.color
                  )}
                />
              )}
              <span className="text-xs font-medium">{selectedMode?.label}</span>
              <ChevronDown
                className={cn(
                  'ml-0.5 size-3 opacity-50 transition-transform duration-200',
                  dropdownOpen && 'rotate-180'
                )}
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64" sideOffset={5}>
            {visibleModeConfigs.map(config => {
              const ModeIcon = config.icon
              const isSelected = value === config.value
              return (
                <DropdownMenuItem
                  key={config.value}
                  onClick={() => handleModeSelect(config.value)}
                  className="relative flex cursor-pointer flex-col items-start gap-1 py-2 pl-8 pr-2 focus:outline-none"
                >
                  {isSelected && (
                    <Check className="absolute left-2 top-2.5 size-4" />
                  )}
                  <div className="flex items-center gap-2">
                    <ModeIcon
                      className={cn('size-4 transition-colors', config.color)}
                    />
                    <span className="text-sm font-medium">{config.label}</span>
                  </div>
                  <div className="ml-6 flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">
                      {config.description}
                    </span>
                  </div>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Desktop Toggle */}
      <div className="hidden sm:block">
        <div className="relative inline-flex items-center rounded-full border border-zinc-200/80 bg-white/70 p-1 shadow-[0_10px_30px_-28px_rgba(24,24,27,0.42)] backdrop-blur">
          {/* Animated background indicator */}
          <div
            className="absolute inset-1 rounded-full bg-muted transition-all duration-200 ease-out"
            style={{
              width: `calc(${100 / modeCount}% - 4px)`,
              transform: `translateX(${selectedIndex * 100}%)`
            }}
          />

          {/* Mode buttons */}
          <div className="relative flex items-center">
            {visibleModeConfigs.map(config => {
              const Icon = config.icon
              const isSelected = value === config.value

              return (
                <HoverCard
                  key={config.value}
                  open={!justSelected && openHoverCard === config.value}
                  onOpenChange={open => {
                    if (!justSelected) {
                      setOpenHoverCard(open ? config.value : null)
                    }
                  }}
                  openDelay={100}
                  closeDelay={50}
                >
                  <HoverCardTrigger asChild>
                    <button
                      type="button"
                      onClick={() => handleModeSelect(config.value)}
                      className={cn(
                        'relative z-10 inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors duration-200',
                        isSelected
                          ? 'text-foreground'
                          : 'text-muted-foreground hover:text-foreground/80'
                      )}
                      aria-label={`${config.label} mode`}
                      aria-pressed={isSelected}
                    >
                      <Icon
                        className={cn(
                          'size-3.5 shrink-0 transition-colors',
                          isSelected ? config.color : ''
                        )}
                      />
                      <span className="hidden max-w-24 truncate lg:inline">
                        {config.label}
                      </span>
                    </button>
                  </HoverCardTrigger>

                  <HoverCardContent
                    className="w-72"
                    align="center"
                    sideOffset={8}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Icon className={cn('size-5', config.color)} />
                        <h4 className="text-sm font-semibold">
                          {config.label}
                        </h4>
                      </div>
                      <p className="text-xs text-muted-foreground leading-tight">
                        {config.description}
                      </p>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
