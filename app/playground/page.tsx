import Link from 'next/link'

import { BookOpen, Code2, KeyRound, TerminalSquare } from 'lucide-react'

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
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden pt-12">
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">Brok Playground</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Test chat, streaming, model routing, and copy-ready integration
              snippets from one clean workspace.
            </p>
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 2xl:mx-0 2xl:pb-0">
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
      <ChatPlayground />
    </div>
  )
}
