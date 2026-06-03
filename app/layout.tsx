import type { Metadata, Viewport } from 'next'
import { Inter as FontSans } from 'next/font/google'
import Script from 'next/script'

import { Analytics } from '@vercel/analytics/next'

import { requireAdminAccess } from '@/lib/auth/admin'
import { UserProvider } from '@/lib/contexts/user-context'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

import { Toaster } from '@/components/ui/sonner'

import { AppChrome } from '@/components/app-chrome'
import { ThemeProvider } from '@/components/theme-provider'

import './globals.css'

const fontSans = FontSans({
  subsets: ['latin'],
  variable: '--font-sans'
})

const title = 'brok'
const description =
  'Enterprise AI workspace for search, mail, code, and governed tool workflows.'
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
  applicationName: 'Brok',
  manifest: '/manifest.webmanifest',
  openGraph: {
    title,
    description
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Brok'
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [{ url: '/pwa/apple-touch-icon.png', sizes: '180x180' }]
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
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff'
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

  const adminAccess = await requireAdminAccess()

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
          <UserProvider hasUser={!!user}>
            <AppChrome user={user} isAdmin={adminAccess.ok}>
              {children}
            </AppChrome>
          </UserProvider>
          <Toaster />
          {enableVercelAnalytics ? <Analytics /> : null}
        </ThemeProvider>
      </body>
    </html>
  )
}
