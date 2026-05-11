import Link from 'next/link'

import {
  ArrowRight,
  CircleCheck,
  LockKeyhole,
  type LucideIcon,
  Sparkles
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type HubAction = {
  href: string
  label: string
  icon: LucideIcon
  description: string
  metric?: string
}

export function WorkspaceHubPage({
  title,
  subtitle,
  badge,
  actions
}: {
  title: string
  subtitle: string
  badge: string
  actions: HubAction[]
}) {
  const trustSignals = [
    { label: 'Scoped account access', icon: LockKeyhole },
    { label: 'Live tool status', icon: Sparkles },
    { label: 'Production controls', icon: CircleCheck }
  ]

  return (
    <div className="dashboard-shell relative h-full overflow-y-auto pt-12">
      <div className="mx-auto w-full max-w-7xl space-y-7 px-4 pb-14 pt-7 sm:space-y-8 sm:px-6 lg:px-8">
        <div className="dashboard-panel flex flex-col gap-5 p-5 sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className="rounded-md border border-border/70 bg-background/80 text-foreground/70"
              >
                {badge}
              </Badge>
              <span className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background/84 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                <Sparkles className="size-3.5 text-primary" />
                Enterprise workspace
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground/92 sm:text-3xl">
              {title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground/90 sm:text-base">
              {subtitle}
            </p>
          </div>
          <Button
            asChild
            variant="outline"
            className="group gap-2 self-start rounded-lg border border-border/70 bg-background/82 text-foreground/80 shadow-sm transition-all duration-150 hover:border-border/85 hover:bg-background/94 hover:text-foreground/92 hover:shadow-md sm:self-auto"
          >
            <Link href="/">
              Open Search
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          </div>

          <div className="grid gap-2 border-t border-border/65 pt-4 sm:grid-cols-3">
            {trustSignals.map(signal => {
              const Icon = signal.icon
              return (
                <div
                  key={signal.label}
                  className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/58 px-3 py-2 text-xs font-medium text-muted-foreground"
                >
                  <Icon className="size-3.5 text-primary" />
                  <span>{signal.label}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-1 grid gap-4 [grid-auto-rows:minmax(10rem,auto)] sm:grid-cols-2 xl:grid-cols-3">
          {actions.map(action => {
            const Icon = action.icon
            return (
              <Link
                key={action.href}
                href={action.href}
                className="dashboard-action-card group relative overflow-hidden p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <div className="pointer-events-none absolute inset-y-5 left-0 w-0.5 rounded-r-full bg-gradient-to-b from-blue-500 via-teal-500 to-orange-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/65 bg-background/78 text-foreground/66 transition-colors duration-150 group-hover:text-foreground/86">
                      <Icon className="size-4" />
                    </span>
                    <p className="truncate text-sm font-medium text-foreground/90">
                      {action.label}
                    </p>
                  </div>
                  {action.metric ? (
                    <Badge
                      variant="outline"
                      className="rounded-md border-border/60 bg-background/70 text-[11px] font-medium text-foreground/60"
                    >
                      {action.metric}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground/90">
                  {action.description}
                </p>
                <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-foreground/70 transition-transform duration-200 group-hover:translate-x-0.5">
                  Open
                  <ArrowRight className="size-3.5" />
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
