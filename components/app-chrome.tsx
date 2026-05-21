'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'

import type { User } from '@supabase/supabase-js'

import { cn } from '@/lib/utils'

import { SidebarProvider } from '@/components/ui/sidebar'

import AppSidebar from '@/components/app-sidebar'
import ArtifactRoot from '@/components/artifact/artifact-root'
import { FeatureRequestWidget } from '@/components/feature-request-widget'
import Header from '@/components/header'
import { KeyboardShortcutHandler } from '@/components/keyboard-shortcut-handler'
import { MobileAppNav } from '@/components/mobile-app-nav'
import { PwaLifecycle } from '@/components/pwa-lifecycle'

export function AppChrome({
  user,
  children
}: {
  user: User | null
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isAuthRoute = pathname?.startsWith('/auth')
  const isDocsRoute = pathname?.startsWith('/docs')
  const isPublicLanding = pathname === '/' && !user
  const isFocusWorkspace =
    pathname?.startsWith('/brokcode') || pathname?.startsWith('/brokmail')
  const usesPageScroll =
    isDocsRoute ||
    pathname === '/playground' ||
    pathname?.startsWith('/tools') ||
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/brokcode')
  const [sidebarState, setSidebarState] = useState({
    isFocusWorkspace,
    open: !isFocusWorkspace
  })

  if (sidebarState.isFocusWorkspace !== isFocusWorkspace) {
    setSidebarState({
      isFocusWorkspace,
      open: !isFocusWorkspace
    })
  }

  const setSidebarOpen = (open: boolean) => {
    setSidebarState({
      isFocusWorkspace,
      open
    })
  }

  if (isAuthRoute || isPublicLanding) {
    return (
      <main className="flex min-h-svh w-full overflow-y-auto bg-background">
        {children}
        <PwaLifecycle />
      </main>
    )
  }

  return (
    <SidebarProvider
      defaultOpen={!isFocusWorkspace}
      open={sidebarState.open}
      onOpenChange={setSidebarOpen}
    >
      <AppSidebar />
      <KeyboardShortcutHandler />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header user={user} />
        <main
          className={cn(
            'app-scroll-root flex min-h-0 min-w-0 flex-1 bg-zinc-50/70 pb-[calc(4.35rem+env(safe-area-inset-bottom))] md:pb-0',
            usesPageScroll ? 'overflow-y-auto' : 'overflow-hidden'
          )}
        >
          <ArtifactRoot>{children}</ArtifactRoot>
        </main>
        <MobileAppNav />
        <PwaLifecycle />
        <FeatureRequestWidget />
      </div>
    </SidebarProvider>
  )
}
