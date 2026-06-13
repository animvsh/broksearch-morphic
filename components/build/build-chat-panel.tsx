'use client'

import { type ReactNode,useEffect, useMemo, useRef, useState } from 'react'

import {
  Bot,
  CheckCircle2,
  CircleDot,
  Loader2,
  Send,
  Sparkles,
  User
} from 'lucide-react'

import type { BrokBuildPhase, BrokStreamEvent } from '@/lib/build/types'
import { PHASE_LABELS } from '@/lib/build/types'
import { cn } from '@/lib/utils'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  time: string
  kind?: 'plan' | 'phase' | 'log'
  phase?: BrokBuildPhase
}

type ChatPanelProps = {
  prompt: string
  events: BrokStreamEvent[]
  isBuilding: boolean
  phase: BrokBuildPhase
  onSendEdit: (message: string) => void
  planCard?: ReactNode
}

function phaseEventToMessage(event: BrokStreamEvent, time: string): ChatMessage | null {
  if (event.kind === 'phase') {
    return {
      id: `phase-${time}-${event.phase}`,
      role: 'assistant',
      kind: 'phase',
      phase: event.phase,
      content: event.message,
      time
    }
  }
  if (event.kind === 'log') {
    return {
      id: `log-${time}-${event.message.slice(0, 32)}`,
      role: 'system',
      kind: 'log',
      content: event.message,
      time
    }
  }
  return null
}

export function BuildChatPanel({
  prompt,
  events,
  isBuilding,
  phase,
  onSendEdit,
  planCard
}: ChatPanelProps) {
  const [value, setValue] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const messages = useMemo<ChatMessage[]>(() => {
    const initialUser: ChatMessage = {
      id: 'user-initial',
      role: 'user',
      content: prompt,
      time: new Date().toISOString()
    }
    const derived: ChatMessage[] = [initialUser]
    for (const event of events) {
      const msg = phaseEventToMessage(event, new Date().toISOString())
      if (msg) derived.push(msg)
    }
    return derived
  }, [events, prompt])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const send = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    onSendEdit(trimmed)
    setValue('')
  }

  return (
    <section className="flex h-full min-h-0 flex-col border-r border-border/60 bg-background">
      <div className="flex h-9 items-center gap-2 border-b border-border/60 px-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" /> Chat &amp; Build Feed
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {planCard ? <div className="mb-3">{planCard}</div> : null}
        <ul className="flex flex-col gap-3">
          {messages.map(message => (
            <ChatItem key={message.id} message={message} />
          ))}
        </ul>
      </div>

      <div className="border-t border-border/60 p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={
              phase === 'ready'
                ? 'Make it feel more premium, add onboarding, ...'
                : 'Type to add a follow-up. Brok will keep editing by chat.'
            }
            rows={2}
            className="min-h-[56px] resize-none border-border/60 bg-background"
            onKeyDown={event => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault()
                send()
              }
            }}
          />
          <Button
            type="button"
            onClick={send}
            disabled={!value.trim() || phase === 'failed'}
            className="h-10"
          >
            {isBuilding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span className="sr-only">Send edit</span>
          </Button>
        </div>
        <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {phaseLabelFor(phase)}
        </p>
      </div>
    </section>
  )
}

function ChatItem({ message }: { message: ChatMessage }) {
  if (message.role === 'system') {
    return (
      <li className="flex items-start gap-2 text-xs text-muted-foreground">
        <CircleDot className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/60" />
        <span className="font-mono leading-relaxed">{message.content}</span>
      </li>
    )
  }
  if (message.role === 'user') {
    return (
      <li className="flex items-start gap-2">
        <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-foreground/5 text-foreground/80">
          <User className="h-3.5 w-3.5" />
        </span>
        <div className="rounded-2xl rounded-tl-md bg-foreground/[0.04] px-3 py-2 text-sm leading-relaxed text-foreground">
          {message.content}
        </div>
      </li>
    )
  }
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-foreground text-background">
        <Bot className="h-3.5 w-3.5" />
      </span>
      <div className="flex max-w-full flex-col gap-1">
        {message.phase ? (
          <Badge variant="secondary" className="self-start text-[10px] uppercase tracking-[0.18em]">
            {PHASE_LABELS[message.phase] ?? message.phase}
          </Badge>
        ) : null}
        <div
          className={cn(
            'rounded-2xl rounded-tl-md bg-foreground/[0.04] px-3 py-2 text-sm leading-relaxed text-foreground'
          )}
        >
          {message.content}
        </div>
      </div>
    </li>
  )
}

function phaseLabelFor(phase: BrokBuildPhase) {
  switch (phase) {
    case 'idle':
      return 'Ready when you are.'
    case 'ready':
      return 'Preview ready — keep editing by chat.'
    case 'failed':
      return 'Build failed. Try again or adjust the prompt.'
    case 'adjusting':
      return 'Applying edit...'
    default:
      return PHASE_LABELS[phase] ?? phase
  }
}

export type PhaseStatusIconProps = {
  phase: BrokBuildPhase
}

export function PhaseStatusIcon({ phase }: PhaseStatusIconProps) {
  if (phase === 'ready') {
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
  }
  if (phase === 'failed') {
    return <CircleDot className="h-3.5 w-3.5 text-rose-500" />
  }
  return <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground/60" />
}
