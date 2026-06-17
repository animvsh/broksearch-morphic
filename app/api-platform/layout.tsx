'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  Activity,
  FlaskConical,
  History,
  KeyRound,
  ScrollText
} from 'lucide-react'

import { cn } from '@/lib/utils'

const tabs = [
  { href: '/api-platform/keys', value: 'keys', label: 'Keys', icon: KeyRound },
  {
    href: '/api-platform/usage',
    value: 'usage',
    label: 'Usage',
    icon: Activity
  },
  {
    href: '/api-platform/logs',
    value: 'logs',
    label: 'Logs',
    icon: ScrollText
  },
  {
    href: '/api-platform/audit',
    value: 'audit',
    label: 'Audit',
    icon: History
  },
  {
    href: '/api-platform/playground',
    value: 'playground',
    label: 'Playground',
    icon: FlaskConical
  }
]

export default function ApiLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const getActiveTab = () => {
    for (const tab of tabs) {
      if (pathname === tab.href || pathname.startsWith(tab.href + '/')) {
        return tab.value
      }
    }
    return 'keys'
  }

  const activeTab = getActiveTab()

  return (
    <div className="dashboard-shell min-h-svh px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="overflow-hidden rounded-xl border bg-background shadow-sm">
          <div className="flex flex-col gap-4 p-5 sm:p-6 lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
                API Manager
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Manage your Brok API keys, monitor usage, view logs, and test
                requests.
              </p>
            </div>
          </div>
          <div className="border-b overflow-x-auto">
            <nav className="flex min-w-max items-stretch sm:min-w-full">
              {tabs.map(tab => {
                const Icon = tab.icon
                const isActive = activeTab === tab.value
                return (
                  <Link
                    key={tab.value}
                    href={tab.href}
                    className={cn(
                      'inline-flex h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors',
                      isActive
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                    )}
                  >
                    <Icon className="size-4" />
                    {tab.label}
                  </Link>
                )
              })}
            </nav>
          </div>
        </header>
        <div className="min-h-[500px]">{children}</div>
      </div>
    </div>
  )
}
