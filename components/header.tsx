'use client'

import React from 'react'
import Link from 'next/link'

import { User } from '@supabase/supabase-js'

import { IconBlinkingLogo } from '@/components/ui/icons'
import { SidebarTrigger } from '@/components/ui/sidebar'

import GuestMenu from './guest-menu'
import UserMenu from './user-menu'

interface HeaderProps {
  user: User | null
}

export const Header: React.FC<HeaderProps> = ({ user }) => {
  return (
    <header className="pointer-events-none sticky top-0 z-[70] flex h-14 w-full shrink-0 items-center justify-between border-b border-zinc-200/80 bg-white/88 px-3 text-zinc-950 shadow-[0_16px_42px_-40px_rgba(24,24,27,0.5)] backdrop-blur-xl md:px-4">
      <div className="pointer-events-auto flex min-w-0 items-center gap-2">
        <SidebarTrigger
          className="size-9 shrink-0 rounded-full border border-zinc-200/80 bg-white/88 text-zinc-700 shadow-[0_10px_28px_-24px_rgba(24,24,27,0.45)] transition-colors duration-150 hover:border-zinc-300 hover:bg-white hover:text-zinc-950"
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
