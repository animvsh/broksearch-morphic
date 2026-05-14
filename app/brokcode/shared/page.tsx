import Link from 'next/link'

import { Bot, CircleAlert, User } from 'lucide-react'

import { cn } from '@/lib/utils'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type SharedMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

type PortableSharedChat = {
  title: string
  createdAt: string
  messages: SharedMessage[]
}

function decodePortableSharePayload(data: string | undefined) {
  if (!data) return null

  try {
    const normalized = data.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
    const json = Buffer.from(padded, 'base64').toString('utf8')
    const parsed = JSON.parse(json) as {
      title?: unknown
      createdAt?: unknown
      messages?: unknown
    }

    if (!Array.isArray(parsed.messages)) {
      return null
    }

    const messages: SharedMessage[] = parsed.messages
      .map(entry => {
        if (!entry || typeof entry !== 'object') return null
        const roleValue = (entry as { role?: unknown }).role
        const contentValue = (entry as { content?: unknown }).content
        if (
          typeof roleValue !== 'string' ||
          typeof contentValue !== 'string' ||
          !['user', 'assistant', 'system'].includes(roleValue)
        ) {
          return null
        }

        return {
          role: roleValue as SharedMessage['role'],
          content: contentValue
        }
      })
      .filter((entry): entry is SharedMessage => Boolean(entry))

    if (messages.length === 0) {
      return null
    }

    return {
      title:
        typeof parsed.title === 'string' && parsed.title.trim().length > 0
          ? parsed.title.trim()
          : 'Brok Code Shared Chat',
      createdAt:
        typeof parsed.createdAt === 'string'
          ? parsed.createdAt
          : new Date().toISOString(),
      messages
    } satisfies PortableSharedChat
  } catch {
    return null
  }
}

export default async function BrokCodeSharedPage(props: {
  searchParams: Promise<{ data?: string }>
}) {
  const { data } = await props.searchParams
  const sharedChat = decodePortableSharePayload(data)

  if (!sharedChat) {
    return (
      <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center justify-center px-4 pt-20">
        <section className="w-full rounded-md border bg-background p-6">
          <div className="mb-4 flex items-center gap-2">
            <CircleAlert className="size-4 text-amber-600 dark:text-amber-400" />
            <p className="text-sm font-medium">Invalid or expired share link</p>
          </div>
          <p className="text-sm text-muted-foreground">
            This shared Brok Code conversation could not be loaded.
          </p>
          <div className="mt-4">
            <Button asChild>
              <Link href="/brokcode">Open Brok Code</Link>
            </Button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-10 pt-16">
      <header className="rounded-md border bg-background p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">{sharedChat.title}</h1>
          <Badge variant="secondary" className="rounded-md">
            Shared from Brok Code
          </Badge>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Shared on {new Date(sharedChat.createdAt).toLocaleString()}
        </p>
      </header>

      <section className="mt-4 space-y-3">
        {sharedChat.messages.map((message, index) => {
          const isUser = message.role === 'user'
          return (
            <article
              key={`${message.role}-${index}`}
              className={cn(
                'flex gap-2',
                isUser ? 'justify-end' : 'justify-start'
              )}
            >
              {!isUser && (
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted">
                  <Bot className="size-4" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[min(100%,46rem)] rounded-md border p-3 text-sm leading-6',
                  isUser
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background'
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
              {isUser && (
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-primary text-primary-foreground">
                  <User className="size-4" />
                </div>
              )}
            </article>
          )
        })}
      </section>

      <div className="mt-5">
        <Button asChild variant="outline">
          <Link href="/brokcode">Open Brok Code</Link>
        </Button>
      </div>
    </main>
  )
}
