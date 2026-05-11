import Link from 'next/link'

import { ArrowRight, type LucideIcon } from 'lucide-react'

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
  return (
    <div className="h-full overflow-y-auto pt-12">
      <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="secondary" className="rounded-md">
              {badge}
            </Badge>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              {title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base">
              {subtitle}
            </p>
          </div>
          <Button asChild className="gap-2 self-start sm:self-auto">
            <Link href="/">
              Open Search
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {actions.map(action => {
            const Icon = action.icon
            return (
              <Link
                key={action.href}
                href={action.href}
                className="rounded-md border bg-background p-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-primary" />
                    <p className="text-sm font-medium">{action.label}</p>
                  </div>
                  {action.metric ? (
                    <Badge variant="outline" className="rounded-md">
                      {action.metric}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {action.description}
                </p>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
