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
        'shell-topbar pointer-events-none absolute top-0 right-0 z-[70] flex h-16 items-center justify-between border-b border-zinc-200/70 bg-white/82 px-3 text-zinc-950 shadow-none backdrop-blur-xl transition-[width] duration-200 ease-linear md:m-3 md:h-14 md:rounded-2xl md:border md:px-4',
        open ? 'md:w-[calc(100%-var(--sidebar-width))]' : 'md:w-full',
        'w-full'
      )}
    >
      <div className="pointer-events-auto flex min-w-0 items-center gap-2">
        <SidebarTrigger
          className="size-9 shrink-0 rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 hover:shadow-sm"
          title="Toggle sidebar"
        />
        <Link href="/" className="inline-flex min-w-0 items-center gap-2.5">
          <span className="brand-badge brand-halo rounded-full p-1.5">
            <IconBlinkingLogo className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="brand-wordmark truncate text-sm font-semibold text-zinc-950">
              brok
            </span>
            <span className="hidden items-center gap-1.5 text-[11px] text-zinc-500 sm:inline-flex">
              <span className="brand-status-pulse" aria-hidden />
              search, code, mail, slides
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
