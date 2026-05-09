'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { toast } from 'sonner'

import type { ThemeId } from '@/lib/presentations/themes'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'

import { PromptBox } from '@/components/presentations/creator/prompt-box'
import { SettingsPanel } from '@/components/presentations/creator/settings-panel'

const DEFAULT_SETTINGS = {
  slideCount: 8,
  style: 'professional',
  language: 'en',
  webSearch: false,
  theme: 'auto' as ThemeId | 'auto'
}

export default function NewPresentationPage() {
  const router = useRouter()
  const [topic, setTopic] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)

  const handleSubmit = async () => {
    if (!topic.trim()) {
      toast.error('Please enter a presentation topic')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/presentations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          slide_count: settings.slideCount,
          style: settings.style,
          language: settings.language,
          web_search: settings.webSearch,
          theme: settings.theme === 'auto' ? null : settings.theme
        })
      })

      if (response.status === 401) {
        toast.error('Please sign in to create a presentation')
        router.replace(
          `/auth/login?redirectTo=${encodeURIComponent('/presentations/new')}`
        )
        return
      }

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create presentation')
      }

      const data = await response.json()
      toast.success('Presentation created! Generating outline...')
      router.push(`/presentations/${data.presentation_id}`)
    } catch (error) {
      console.error('Error creating presentation:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to create presentation'
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container max-w-3xl mx-auto py-8 px-4">
        {/* Back link */}
        <Link
          href="/presentations"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <svg
            className="size-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Back to Presentations
        </Link>

        {/* Card */}
        <div className="rounded-2xl border bg-card text-card-foreground shadow-lg">
          {/* Header */}
          <div className="border-b px-6 py-5">
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold tracking-tight">[BROK]</span>
              <span className="text-xl font-bold tracking-tight">
                Presentations
              </span>
              <span className="text-muted-foreground">— New</span>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-8">
            {/* Prompt Box */}
            <PromptBox
              value={topic}
              onChange={setTopic}
              onSubmit={handleSubmit}
              isLoading={isLoading}
            />

            {/* Settings Panel */}
            <SettingsPanel
              slideCount={settings.slideCount}
              onSlideCountChange={count =>
                setSettings(s => ({ ...s, slideCount: count }))
              }
              style={settings.style}
              onStyleChange={style => setSettings(s => ({ ...s, style }))}
              language={settings.language}
              onLanguageChange={language =>
                setSettings(s => ({ ...s, language }))
              }
              webSearch={settings.webSearch}
              onWebSearchChange={webSearch =>
                setSettings(s => ({ ...s, webSearch }))
              }
              theme={settings.theme}
              onThemeChange={theme => setSettings(s => ({ ...s, theme }))}
            />

            {/* Submit Button */}
            <div className="flex justify-end pt-4 border-t">
              <Button
                size="lg"
                onClick={handleSubmit}
                disabled={isLoading || !topic.trim()}
                className={cn(
                  'min-w-[200px] transition-all duration-200',
                  isLoading && 'opacity-70'
                )}
              >
                {isLoading ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Creating...
                  </>
                ) : (
                  <>
                    Generate Outline
                    <svg
                      className="ml-2 h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                      />
                    </svg>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
