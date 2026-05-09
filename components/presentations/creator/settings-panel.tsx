'use client'

import React, { useState } from 'react'
import { ChevronDown, ChevronUp, Settings2, Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

import { ThemePicker } from '@/components/presentations/theme/theme-picker'

import type { ThemeId } from '@/lib/presentations/themes'

const SLIDE_COUNTS = [5, 8, 10, 12]

const STYLES = [
  { value: 'professional', label: 'Professional' },
  { value: 'casual', label: 'Casual' },
  { value: 'startup', label: 'Startup' },
  { value: 'academic', label: 'Academic' }
] as const

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' }
]

interface SettingsPanelProps {
  slideCount: number
  onSlideCountChange: (count: number) => void
  style: string
  onStyleChange: (style: string) => void
  language: string
  onLanguageChange: (language: string) => void
  webSearch: boolean
  onWebSearchChange: (enabled: boolean) => void
  theme: ThemeId | 'auto'
  onThemeChange: (theme: ThemeId | 'auto') => void
  className?: string
}

export function SettingsPanel({
  slideCount,
  onSlideCountChange,
  style,
  onStyleChange,
  language,
  onLanguageChange,
  webSearch,
  onWebSearchChange,
  theme,
  onThemeChange,
  className
}: SettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={cn('space-y-2', className)}>
      {/* Header */}
      <CollapsibleTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <Settings2 className="size-4" />
          Settings
          {isOpen ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-6 pt-4">
        {/* Slides */}
        <div className="space-y-3">
          <label className="text-sm font-medium">Slides</label>
          <div className="flex flex-wrap gap-2">
            {SLIDE_COUNTS.map((count) => (
              <button
                key={count}
                onClick={() => onSlideCountChange(count)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium transition-all duration-150',
                  'border focus:outline-hidden focus:ring-2 focus:ring-ring/50',
                  slideCount === count
                    ? 'bg-accent text-accent-foreground border-accent'
                    : 'bg-secondary/50 text-secondary-foreground border-border hover:border-accent/50'
                )}
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        {/* Style */}
        <div className="space-y-3">
          <label className="text-sm font-medium">Style</label>
          <div className="flex flex-wrap gap-2">
            {STYLES.map((s) => (
              <button
                key={s.value}
                onClick={() => onStyleChange(s.value)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium transition-all duration-150',
                  'border focus:outline-hidden focus:ring-2 focus:ring-ring/50',
                  style === s.value
                    ? 'bg-accent text-accent-foreground border-accent'
                    : 'bg-secondary/50 text-secondary-foreground border-border hover:border-accent/50'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div className="space-y-3">
          <label className="text-sm font-medium">Language</label>
          <Select value={language} onValueChange={onLanguageChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang.value} value={lang.value}>
                  {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Web Search Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <label className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="size-4 text-accent" />
              Web Search
            </label>
            <p className="text-xs text-muted-foreground">
              Enable real-time data from the web
            </p>
          </div>
          <Switch checked={webSearch} onCheckedChange={onWebSearchChange} />
        </div>

        {/* Theme */}
        <div className="space-y-3">
          <label className="text-sm font-medium">Theme</label>
          <ThemePicker selectedThemeId={theme} onSelect={onThemeChange} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
