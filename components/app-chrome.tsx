'use client'

import { usePathname } from 'next/navigation'

import type { User } from '@supabase/supabase-js'

import { cn } from '@/lib/utils'

import { SidebarProvider } from '@/components/ui/sidebar'

import AppSidebar from '@/components/app-sidebar'
import ArtifactRoot from '@/components/artifact/artifact-root'
import { FeatureRequestWidget } from '@/components/feature-request-widget'
import Header from '@/components/header'
import { KeyboardShortcutHandler } from '@/components/keyboard-shortcut-handler'

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
  const usesPageScroll =
    isDocsRoute ||
    pathname === '/playground' ||
    pathname?.startsWith('/tools') ||
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/brokcode') ||
    pathname?.startsWith('/brokmail')

  if (isAuthRoute) {
    return (
      <main className="flex min-h-svh w-full overflow-y-auto bg-background">
        {children}
      </main>
    )
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <KeyboardShortcutHandler />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header user={user} />
        <main
          className={cn(
            'app-scroll-root flex min-h-0 min-w-0 flex-1 bg-[linear-gradient(180deg,#fff_0%,#fafafa_44%,#f6f6f7_100%)]',
            usesPageScroll ? 'overflow-y-auto' : 'overflow-hidden'
          )}
        >
          <ArtifactRoot>{children}</ArtifactRoot>
        </main>
        <FeatureRequestWidget />
      </div>
    </SidebarProvider>
  )
}
