'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Code2, Home, Mail, PlugZap, Search, Wrench } from 'lucide-react'

import { cn } from '@/lib/utils'

const mobileNavItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/search', label: 'Search', icon: Search },
  { href: '/brokmail', label: 'Mail', icon: Mail },
  { href: '/brokcode', label: 'Code', icon: Code2 },
  { href: '/tools', label: 'Tools', icon: Wrench },
  { href: '/integrations', label: 'Apps', icon: PlugZap }
]

function isActivePath(pathname: string | null, href: string) {
  if (!pathname) return false
  if (href === '/') return pathname === '/'
  if (href === '/search') return pathname === '/search' || pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function MobileAppNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Mobile app navigation"
      className="mobile-app-nav fixed inset-x-0 bottom-0 z-[80] border-t border-zinc-200/80 bg-white/92 px-2 pb-[calc(env(safe-area-inset-bottom)+0.45rem)] pt-1.5 shadow-[0_-22px_54px_-44px_rgba(15,23,42,0.42)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-6 gap-1">
        {mobileNavItems.map(item => {
          const Icon = item.icon
          const active = isActivePath(pathname, item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'clicky-control inline-flex min-w-0 min-h-[3rem] flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1 text-[10px] font-medium text-zinc-500 transition-colors duration-150 sm:text-xs',
                active
                  ? 'bg-zinc-950 text-white shadow-[0_10px_26px_-18px_rgba(9,9,11,0.8)]'
                  : 'hover:bg-zinc-100 hover:text-zinc-950'
              )}
            >
              <Icon className="size-4.5" />
              <span className="max-w-full truncate leading-none">
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
