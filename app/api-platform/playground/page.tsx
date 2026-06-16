import type { Metadata } from 'next'
import Link from 'next/link'

import { BookOpen, KeyRound, Sparkles } from 'lucide-react'

import { requireFeatureAccess } from '@/lib/auth/app-access'

import { Button } from '@/components/ui/button'

import { ChatPlayground } from '@/components/playground/chat-playground'

export const metadata: Metadata = {
  title: 'BrokCode API',
  description:
    'Test the BrokCode API with streaming chat, model routing, API keys, and OpenAI-compatible integration snippets.'
}

export default async function PlaygroundPage() {
  await requireFeatureAccess('/api-platform/playground', 'api_platform')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href="/docs/quickstart">
              <BookOpen className="size-4" />
              Quickstart
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href="/docs/api-keys">
              <KeyRound className="size-4" />
              API Keys
            </Link>
          </Button>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
          Streaming sandbox
        </div>
      </div>
      <ChatPlayground />
    </div>
  )
}
