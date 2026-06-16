'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  ArrowRight,
  BookOpenCheck,
  Compass,
  Dumbbell,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  MessagesSquare,
  Mic2,
  Search,
  ShoppingBag,
  Sparkles,
  Wrench
} from 'lucide-react'

import type { BrokBuildEmptyStateChip } from '@/lib/build/types'
import { cn } from '@/lib/utils'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'ai-study': GraduationCap,
  'nutrition-tracker': Dumbbell,
  'saas-dashboard': LayoutDashboard,
  'ai-search': Search,
  crm: ListChecks,
  marketplace: ShoppingBag,
  'internal-tool': Wrench,
  'ai-voice-coach': Mic2
}

const SECONDARY_LINKS: Array<{
  href: string
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  {
    href: '/brokcode',
    label: 'Open BrokCode',
    description: 'Code-first builder with file editing, GitHub, and Pi runtime.',
    icon: BookOpenCheck
  },
  {
    href: '/discover',
    label: 'See examples',
    description: 'Browse example apps that others have built with Brok Build.',
    icon: Compass
  },
  {
    href: '/playground',
    label: 'Try the chat',
    description: 'Just want to talk to Brok without building? Use the playground.',
    icon: MessagesSquare
  }
]

type BrokBuildEmptyStateProps = {
  chips: BrokBuildEmptyStateChip[]
}

export function BrokBuildEmptyState({ chips }: BrokBuildEmptyStateProps) {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const placeholder = useMemo(
    () => 'Build me an AI app that...',
    []
  )

  const handleSubmit = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim()
      if (!trimmed || submitting) return
      setSubmitting(true)
      const params = new URLSearchParams({
        prompt: trimmed,
        autostart: '1'
      })
      router.push(`/build/new?${params.toString()}`)
    },
    [router, submitting]
  )

  return (
    <main className="relative isolate flex min-h-[calc(100vh-64px)] flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-background via-background to-muted/30 px-4 py-16 sm:px-6 lg:px-8">
      <BackgroundDecor />

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        <Badge
          variant="secondary"
          className="mb-6 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted-foreground backdrop-blur"
        >
          <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Brok Build
        </Badge>

        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          What do you want to build?
        </h1>
        <p className="mt-4 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
          Describe an app. Brok will plan a starter scaffold, save it into
          BrokCode, and show a managed preview you can keep editing.
        </p>

        <form
          className="mt-10 w-full"
          onSubmit={event => {
            event.preventDefault()
            handleSubmit(value)
          }}
        >
          <label className="sr-only" htmlFor="brok-build-prompt">
            Describe the app you want to build
          </label>
          <div className="group relative flex w-full items-center gap-2 rounded-2xl border border-border/80 bg-background/80 p-2 shadow-lg shadow-black/5 backdrop-blur transition focus-within:border-foreground/40 focus-within:shadow-xl">
            <textarea
              id="brok-build-prompt"
              className="min-h-[64px] flex-1 resize-none rounded-xl border-0 bg-transparent px-4 py-3 text-base shadow-none outline-none placeholder:text-muted-foreground/70 focus:ring-0 focus-visible:ring-0"
              placeholder={placeholder}
              value={value}
              onChange={event => setValue(event.target.value)}
              onKeyDown={event => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault()
                  handleSubmit(value)
                }
              }}
              rows={2}
            />
            <Button
              type="submit"
              size="lg"
              className="h-12 rounded-xl px-5"
              disabled={!value.trim() || submitting}
            >
              {submitting ? 'Starting…' : 'Build'}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Brok will auto-start building after a short pause. You can adjust
            the plan first.
          </p>
        </form>

        <div className="mt-10 w-full">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Or start with an example
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {chips.map(chip => {
              const Icon = ICON_MAP[chip.id]
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setValue(chip.prompt)}
                  className={cn(
                    'group inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3.5 py-2 text-sm font-medium text-foreground/80 transition hover:-translate-y-0.5 hover:border-foreground/30 hover:bg-background hover:text-foreground hover:shadow-md'
                  )}
                >
                  {Icon ? (
                    <Icon className="h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
                  ) : null}
                  {chip.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-12 grid w-full gap-3 sm:grid-cols-3">
          {SECONDARY_LINKS.map(link => {
            const Icon = link.icon
            return (
              <a
                key={link.href}
                href={link.href}
                className="group flex items-start gap-3 rounded-xl border border-border/60 bg-background/70 p-4 text-left transition hover:border-foreground/30 hover:shadow-sm"
              >
                <Icon className="mt-0.5 h-5 w-5 text-muted-foreground transition group-hover:text-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {link.label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {link.description}
                  </p>
                </div>
              </a>
            )
          })}
        </div>
      </div>
    </main>
  )
}

function BackgroundDecor() {
  return (
    <>
      <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-80 w-80 -translate-x-1/2 rounded-full bg-gradient-to-br from-foreground/15 via-foreground/5 to-transparent blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 top-1/3 -z-10 h-72 bg-[radial-gradient(circle_at_30%_30%,rgba(0,0,0,0.06),transparent_55%),radial-gradient(circle_at_70%_60%,rgba(0,0,0,0.05),transparent_60%)] dark:bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.07),transparent_55%),radial-gradient(circle_at_70%_60%,rgba(255,255,255,0.05),transparent_60%)]" />
    </>
  )
}
