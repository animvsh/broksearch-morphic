'use client'

import React from 'react'
import Link from 'next/link'

import { User } from '@supabase/supabase-js'

import { cn } from '@/lib/utils'

import { IconBlinkingLogo } from '@/components/ui/icons'
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar'

import GuestMenu from './guest-menu'
import UserMenu from './user-menu'

interface HeaderProps {
  user: User | null
}

export const Header: React.FC<HeaderProps> = ({ user }) => {
  const { open } = useSidebar()

  return (
    <header
      className={cn(
        'shell-topbar pointer-events-none absolute top-0 right-0 z-[70] m-2 flex items-center justify-between rounded-xl border border-border/75 bg-card/92 p-2 text-foreground backdrop-blur-xl transition-[width] duration-200 ease-linear md:m-3 md:p-3',
        open ? 'md:w-[calc(100%-var(--sidebar-width))]' : 'md:w-full',
        'w-full'
      )}
    >
      <div className="pointer-events-auto flex min-w-0 items-center gap-2">
        <SidebarTrigger
          className="size-8 shrink-0 rounded-xl border border-border/80 bg-card/90 text-foreground shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted/70 hover:shadow-sm"
          title="Toggle sidebar"
        />
        <Link href="/" className="inline-flex min-w-0 items-center gap-2.5">
          <span className="brand-badge brand-halo rounded-lg p-1.5">
            <IconBlinkingLogo className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="brand-gradient-text brand-wordmark truncate text-sm font-semibold">
              brok
            </span>
            <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:inline-flex">
              <span className="brand-status-pulse" aria-hidden />
              enterprise AI workspace
            </span>
          </div>
        </Link>
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        {user ? <UserMenu user={user} /> : <GuestMenu />}
      </div>
    </header>
  )
}

export default Header
