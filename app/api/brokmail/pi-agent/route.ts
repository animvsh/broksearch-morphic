import { NextRequest, NextResponse } from 'next/server'

import { requireFeatureAccessForApi } from '@/lib/auth/app-access'
import { runPiAgentPrompt } from '@/lib/pi/coding-agent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_THREADS = 20
const MAX_EVENTS = 20
const MAX_MESSAGES_PER_THREAD = 6
const MAX_PROMPT_CHARS = 2000
const MAX_TEXT_FIELD_CHARS = 600
const MAX_EVENT_DESCRIPTION_CHARS = 1000
const MAX_MESSAGE_BODY_CHARS = 4000

function compactString(value: unknown, maxChars = MAX_TEXT_FIELD_CHARS) {
  return typeof value === 'string' ? value.slice(0, maxChars) : undefined
}

function compactThread(thread: any) {
  return {
    id: compactString(thread?.id),
    sender: compactString(thread?.sender),
    senderEmail: compactString(thread?.senderEmail),
    subject: compactString(thread?.subject),
    snippet: compactString(thread?.snippet),
    aiSummary: compactString(thread?.aiSummary),
    category: compactString(thread?.category),
    priority: thread?.priority,
    unread: thread?.unread,
    important: thread?.important,
    starred: thread?.starred,
    needsReply: thread?.needsReply,
    waitingOnReply: thread?.waitingOnReply,
    hasAttachments: thread?.hasAttachments,
    actionItems: Array.isArray(thread?.actionItems)
      ? thread.actionItems.slice(0, 6)
      : [],
    openQuestions: Array.isArray(thread?.openQuestions)
      ? thread.openQuestions.slice(0, 6)
      : [],
    messages: Array.isArray(thread?.messages)
      ? thread.messages.slice(-MAX_MESSAGES_PER_THREAD).map((message: any) => ({
          id: compactString(message?.id),
          from: compactString(message?.from),
          to: Array.isArray(message?.to)
            ? message.to
                .slice(0, 8)
                .map((recipient: unknown) => compactString(recipient))
                .filter(Boolean)
            : [],
          sentAt: compactString(message?.sentAt),
          body: compactString(message?.body, MAX_MESSAGE_BODY_CHARS) ?? ''
        }))
      : [],
    receivedAt: compactString(thread?.receivedAt)
  }
}

function compactEvent(event: any) {
  return {
    id: compactString(event?.id),
    summary: compactString(event?.summary),
    description: compactString(event?.description, MAX_EVENT_DESCRIPTION_CHARS),
    location: compactString(event?.location),
    startAt: compactString(event?.startAt),
    endAt: compactString(event?.endAt),
    isAllDay: event?.isAllDay
  }
}

export async function POST(request: NextRequest) {
  const access = await requireFeatureAccessForApi('brokmail')
  if (!access.ok) return access.response
  const user = access.user

  const body = await request.json().catch(() => null)
  const prompt = compactString(body?.prompt, MAX_PROMPT_CHARS)?.trim() ?? ''
  const concise = body?.concise !== false

  if (!prompt) {
    return NextResponse.json({ error: 'prompt is required.' }, { status: 400 })
  }

  const threads = Array.isArray(body?.threads)
    ? body.threads.slice(0, MAX_THREADS).map(compactThread)
    : []
  const calendarEvents = Array.isArray(body?.calendarEvents)
    ? body.calendarEvents.slice(0, MAX_EVENTS).map(compactEvent)
    : []

  const selectedThread =
    threads.find((thread: ReturnType<typeof compactThread>) => {
      return thread.id === body?.selectedThreadId
    }) ?? null
  const selectedCalendarEvent =
    calendarEvents.find((event: ReturnType<typeof compactEvent>) => {
      return event.id === body?.selectedEventId
    }) ?? null

  const agentPrompt = [
    'You are BrokMail, powered by Pi coding-agent. You are operating inside a real email client, not a demo.',
    'Use only the provided live mailbox/calendar context. If the context is empty, say Gmail or Calendar must be connected before you can answer.',
    'Do not claim you sent, archived, deleted, labeled, or created anything. For writes, produce reviewable content or say an approval card is required.',
    concise
      ? 'Keep the response concise (ideally 2-5 short bullets or 1-2 short paragraphs). Avoid long rambling intros.'
      : 'Keep the response readable but do not exceed practical email draft length. For replies, still return only the draft body.',
    'For reply drafts, output only the email draft body unless the user asked for explanation.',
    '',
    `User command: ${prompt}`,
    '',
    `Selected thread: ${JSON.stringify(selectedThread)}`,
    `Selected calendar event: ${JSON.stringify(selectedCalendarEvent)}`,
    `Mailbox threads: ${JSON.stringify(threads)}`,
    `Calendar events: ${JSON.stringify(calendarEvents)}`
  ].join('\n')

  try {
    const result = await runPiAgentPrompt({
      mode: 'brokmail',
      prompt: agentPrompt,
      noTools: 'all'
    })

    return NextResponse.json({
      provider: 'pi-coding-agent',
      runtime: 'pi',
      model: result.model,
      modelProvider: result.provider,
      sessionId: result.sessionId,
      events: result.events,
      content: result.content
    })
  } catch (error) {
    console.error('BrokMail Pi agent failed:', error)

    return NextResponse.json(
      {
        error:
          'BrokMail assistant is temporarily unavailable. Try again in a moment.'
      },
      { status: 503 }
    )
  }
}
