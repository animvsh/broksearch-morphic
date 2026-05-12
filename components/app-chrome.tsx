'use client'

import { usePathname } from 'next/navigation'

import type { User } from '@supabase/supabase-js'

import { SidebarProvider } from '@/components/ui/sidebar'

import AppSidebar from '@/components/app-sidebar'
import ArtifactRoot from '@/components/artifact/artifact-root'
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
        <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <ArtifactRoot>{children}</ArtifactRoot>
        </main>
      </div>
    </SidebarProvider>
  )
}
