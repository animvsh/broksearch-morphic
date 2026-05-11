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
        'pointer-events-none absolute top-0 right-0 z-[70] flex h-16 items-center justify-between border-b border-zinc-200 bg-white px-3 text-zinc-950 transition-[width] duration-150 ease-linear md:m-3 md:h-14 md:rounded-xl md:border md:px-4',
        open ? 'md:w-[calc(100%-var(--sidebar-width))]' : 'md:w-full',
        'w-full'
      )}
    >
      <div className="pointer-events-auto flex min-w-0 items-center gap-2">
        <SidebarTrigger
          className="size-9 shrink-0 rounded-full border border-zinc-200 bg-white text-zinc-700 transition-colors duration-100 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950"
          title="Toggle sidebar"
        />
        <Link href="/" className="inline-flex min-w-0 items-center gap-2.5">
          <span className="brand-badge brand-halo rounded-full p-1.5">
            <IconBlinkingLogo className="size-4" />
          </span>
          <span className="brand-wordmark truncate text-sm font-semibold text-zinc-950">
            brok
          </span>
        </Link>
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        {user ? <UserMenu user={user} /> : <GuestMenu />}
      </div>
    </header>
  )
}

export default Header
