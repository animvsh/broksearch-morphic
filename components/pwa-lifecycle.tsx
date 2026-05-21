'use client'

import { useEffect, useState } from 'react'

import { Download, WifiOff, X } from 'lucide-react'

import { Button } from '@/components/ui/button'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function PwaLifecycle() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [offline, setOffline] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const register = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      } catch {
        // PWA support is progressive; never block the product shell.
      }
    }

    window.addEventListener('load', register, { once: true })
    return () => window.removeEventListener('load', register)
  }, [])

  useEffect(() => {
    const updateOnlineState = () => setOffline(!navigator.onLine)
    updateOnlineState()

    window.addEventListener('online', updateOnlineState)
    window.addEventListener('offline', updateOnlineState)
    return () => {
      window.removeEventListener('online', updateOnlineState)
      window.removeEventListener('offline', updateOnlineState)
    }
  }, [])

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }

    const onInstalled = () => {
      setInstallPrompt(null)
      setDismissed(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    await installPrompt.userChoice.catch(() => null)
    setInstallPrompt(null)
    setDismissed(true)
  }

  if (offline) {
    return (
      <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-[90] mx-auto flex max-w-sm items-center gap-2 rounded-2xl border border-zinc-200 bg-white/95 px-3 py-2 text-xs text-zinc-700 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.48)] backdrop-blur-xl md:bottom-4">
        <WifiOff className="size-4 shrink-0 text-zinc-950" />
        <span className="min-w-0 flex-1">
          You are offline. Recent app shell pages stay available.
        </span>
      </div>
    )
  }

  if (!installPrompt || dismissed) return null

  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-[90] mx-auto flex max-w-sm items-center gap-2 rounded-2xl border border-zinc-200 bg-white/95 p-2 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.48)] backdrop-blur-xl md:bottom-4 md:right-4 md:left-auto">
      <div className="min-w-0 flex-1 px-1">
        <p className="text-xs font-semibold text-zinc-950">Install Brok</p>
        <p className="truncate text-[11px] text-zinc-500">
          Faster launch, full-screen workspace, mobile app feel.
        </p>
      </div>
      <Button size="sm" className="h-8 gap-1.5 rounded-xl" onClick={install}>
        <Download className="size-3.5" />
        Install
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 rounded-xl"
        aria-label="Dismiss install prompt"
        onClick={() => setDismissed(true)}
      >
        <X className="size-4" />
      </Button>
    </div>
  )
}
