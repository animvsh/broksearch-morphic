import Link from 'next/link'

import {
  BookOpen,
  Code2,
  KeyRound,
  Sparkles,
  TerminalSquare
} from 'lucide-react'

import { Button } from '@/components/ui/button'

import { ChatPlayground } from '@/components/playground/chat-playground'

export default function PlaygroundPage() {
  const docLinks = [
    { href: '/docs/quickstart', label: 'Quickstart', icon: BookOpen },
    { href: '/docs/api-keys', label: 'API Keys', icon: KeyRound },
    { href: '/docs/brokcode', label: 'BrokCode', icon: Code2 },
    { href: '/brokcode/tui', label: 'TUI', icon: TerminalSquare }
  ]

  return (
    <div className="dashboard-shell flex h-[100dvh] min-h-0 flex-col overflow-hidden pt-12">
      <div className="dashboard-panel mx-3 mt-3 shrink-0 px-4 py-3 sm:mx-4">
        <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              Streaming sandbox
              <Sparkles className="size-3.5 text-primary" />
            </div>
            <h1 className="text-xl font-semibold">Brok Playground</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Test chat, streaming, model routing, and copy-ready integration
              snippets from one clean workspace.
            </p>
          </div>
          <div className="-mx-1 flex flex-wrap gap-2 px-1 pb-1 2xl:mx-0 2xl:pb-0">
            {docLinks.map(link => {
              const Icon = link.icon
              return (
                <Button
                  key={link.href}
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 gap-2"
                >
                  <Link href={link.href}>
                    <Icon className="size-4" />
                    {link.label}
                  </Link>
                </Button>
              )
            })}
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 px-3 pb-3 sm:px-4 sm:pb-4">
        <ChatPlayground />
      </div>
    </div>
  )
}
