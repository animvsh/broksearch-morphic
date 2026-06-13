'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils/index'

export interface AdminTab {
  label: string
  href: string
  exact?: boolean
}

export function AdminTabsNav({ tabs }: { tabs: AdminTab[] }) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-wrap gap-1 rounded-md border bg-muted/30 p-1 text-sm">
      {tabs.map(tab => {
        const isActive = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`)

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'rounded-sm px-3 py-1.5 font-medium transition-colors',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
