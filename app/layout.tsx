import type { Metadata, Viewport } from 'next'
import { Inter as FontSans } from 'next/font/google'
import Script from 'next/script'

import { Analytics } from '@vercel/analytics/next'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { UserProvider } from '@/lib/contexts/user-context'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

import { SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'

import AppSidebar from '@/components/app-sidebar'
import ArtifactRoot from '@/components/artifact/artifact-root'
import Header from '@/components/header'
import { KeyboardShortcutHandler } from '@/components/keyboard-shortcut-handler'
import { ThemeProvider } from '@/components/theme-provider'

import './globals.css'

const fontSans = FontSans({
  subsets: ['latin'],
  variable: '--font-sans'
})

const title = 'brok'
const description =
  'Enterprise AI workspace for search, mail, code, presentations, and governed tool workflows.'
const metadataBaseUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  'http://localhost:8080'
const enableVercelAnalytics =
  process.env.VERCEL === '1' ||
  process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === 'true'

export const metadata: Metadata = {
  metadataBase: new URL(metadataBaseUrl),
  title,
  description,
  openGraph: {
    title,
    description
  },
  twitter: {
    title,
    description,
    card: 'summary_large_image'
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1
}

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  let user = null
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (supabaseUrl && supabaseAnonKey) {
    const supabase = await createClient()
    const {
      data: { user: supabaseUser }
    } = await supabase.auth.getUser()
    user = supabaseUser
  }

  const userId = user?.id ?? (await getCurrentUserId())
  const publicEnvScript =
    supabaseUrl && supabaseAnonKey
      ? `window.__BROK_PUBLIC_ENV__=${JSON.stringify({
          NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey
        }).replace(/</g, '\\u003c')};`
      : null

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          'app-shell-gradient fixed inset-0 flex flex-col overflow-hidden font-sans antialiased',
          fontSans.variable
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {publicEnvScript ? (
            <Script
              id="brok-public-env"
              strategy="beforeInteractive"
              dangerouslySetInnerHTML={{ __html: publicEnvScript }}
            />
          ) : null}
          <UserProvider hasUser={!!userId}>
            <SidebarProvider defaultOpen={true}>
              <AppSidebar />
              <KeyboardShortcutHandler />
              <div className="flex flex-col flex-1 min-w-0">
                <Header user={user} />
                <main className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
                  <ArtifactRoot>{children}</ArtifactRoot>
                </main>
              </div>
            </SidebarProvider>
          </UserProvider>
          <Toaster />
          {enableVercelAnalytics ? <Analytics /> : null}
        </ThemeProvider>
      </body>
    </html>
  )
}
