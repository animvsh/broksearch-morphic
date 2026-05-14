'use client'

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition
} from 'react'

import {
  AlertTriangle,
  Archive,
  ArrowDownUp,
  Bot,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Command,
  FileText,
  Flame,
  Inbox,
  Mail,
  MailCheck,
  Paperclip,
  PenLine,
  Reply,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  UserRoundCheck,
  Wand2,
  Zap
} from 'lucide-react'
import { toast } from 'sonner'

import { createShareableChatFromTranscript } from '@/lib/actions/chat'
import {
  AutomationRule,
  brokMailTonePreference,
  MailboxView,
  MailThread
} from '@/lib/brokmail/data'
import { BrokCalendarEvent } from '@/lib/brokmail/google-calendar-client'
import { cn } from '@/lib/utils'
import { safeCopyTextToClipboard } from '@/lib/utils/copy-to-clipboard'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'

type AgentMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  draft?: DraftState
  approval?: ApprovalState
}

type DraftState = {
  subject: string
  body: string
  threadId: string
}

type ApprovalState = {
  id: string
  title: string
  description: string
  action:
    | 'send'
    | 'archive'
    | 'label'
    | 'automation'
    | 'calendar_create'
    | 'calendar_delete'
  count?: number
  targetThreadIds?: string[]
  calendarEvent?: {
    id?: string
    summary: string
    startAt?: string
    endAt?: string
  }
}

type ServerIssuedApproval = {
  id: string
  action: string
  approved: true
  issuedAt: string
  expiresAt: string
  payloadHash: string
  signature: string
}

type ActivityStep = {
  id: string
  message: string
  status: 'running' | 'done'
}

type IntegrationConnectionMode = 'none' | 'composio'
type MailSortMode = 'priority' | 'newest' | 'sender'

const viewLabels: Array<{
  id: MailboxView
  label: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'needs-reply', label: 'Needs Reply', icon: MailCheck },
  { id: 'follow-ups', label: 'Follow-ups', icon: Clock3 },
  { id: 'drafts', label: 'Drafts', icon: PenLine },
  { id: 'sent', label: 'Sent', icon: Send },
  { id: 'newsletters', label: 'Newsletters', icon: Archive },
  { id: 'receipts', label: 'Receipts', icon: FileText },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'automations', label: 'Automations', icon: Zap }
]

const quickPrompts = [
  'What needs my attention today?',
  'Summarize this thread.',
  'Draft a reply asking for the signed version.',
  'Show my next calendar events.',
  'Add a calendar event tomorrow at 3pm called Candidate Interview.',
  'Remove the calendar event called Candidate Interview.',
  'Show follow-ups.',
  'Archive newsletters older than 30 days.',
  'Whenever I get a receipt, label it expenses.'
]

const commandPrompts = [
  'What needs my attention today?',
  'Show follow-ups.',
  'Draft a reply to this thread.',
  'Show my next calendar events.'
]

const sortOptions: Array<{ id: MailSortMode; label: string }> = [
  { id: 'priority', label: 'Priority' },
  { id: 'newest', label: 'Newest' },
  { id: 'sender', label: 'Sender' }
]

function hasLabel(thread: MailThread, label: string) {
  const normalized = label.toLowerCase()
  return thread.labels.some(item => item.toLowerCase() === normalized)
}

function preferredViewForThreads(threads: MailThread[]): MailboxView {
  if (threads.some(thread => hasLabel(thread, 'INBOX'))) return 'inbox'
  if (threads.some(thread => thread.needsReply)) return 'needs-reply'
  if (threads.some(thread => thread.waitingOnReply)) return 'follow-ups'
  if (threads.some(thread => thread.category === 'receipt')) return 'receipts'
  if (threads.some(thread => hasLabel(thread, 'SENT'))) return 'sent'
  return 'needs-reply'
}

async function executeComposioBrokMailAction({
  action,
  threads,
  draftBody,
  calendarEvent,
  approval
}: {
  action:
    | 'create_draft'
    | 'archive_threads'
    | 'create_calendar_event'
    | 'delete_calendar_event'
  threads?: MailThread[]
  draftBody?: string
  calendarEvent?: ApprovalState['calendarEvent']
  approval: Pick<ApprovalState, 'id'>
}) {
  const actionPayload = {
    action,
    threads: (threads ?? []).map(thread => ({
      id: thread.id,
      providerThreadId: thread.providerThreadId,
      providerMessageIds: thread.providerMessageIds,
      senderEmail: thread.senderEmail,
      subject: thread.subject
    })),
    draftBody,
    calendarEvent
  }

  const approvalResponse = await fetch('/api/brokmail/composio/approval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(actionPayload)
  })

  const approvalBody = await approvalResponse.json().catch(() => null)
  if (!approvalResponse.ok) {
    throw new Error(
      typeof approvalBody?.error === 'string'
        ? approvalBody.error
        : 'Could not create a server approval token.'
    )
  }

  const serverApproval = approvalBody?.approval as ServerIssuedApproval | null
  if (!serverApproval?.signature) {
    throw new Error('BrokMail approval token was not returned by the server.')
  }

  const response = await fetch('/api/brokmail/composio/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...actionPayload,
      approval: {
        ...serverApproval,
        clientApprovalId: approval.id
      }
    })
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      typeof body?.error === 'string' ? body.error : 'Composio action failed.'
    )
  }

  return body
}

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

function delay(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

function scoreThreadPriority(thread: MailThread) {
  return [
    thread.unread ? 18 : 0,
    thread.needsReply ? 30 : 0,
    thread.waitingOnReply ? 22 : 0,
    thread.important ? 18 : 0,
    thread.starred ? 8 : 0,
    thread.hasAttachments ? 4 : 0,
    thread.category === 'receipt' ? 6 : 0,
    thread.category === 'newsletter' ? -8 : 0,
    Math.min(thread.actionItems.length * 5, 15),
    Math.min(thread.openQuestions.length * 4, 12)
  ].reduce((total, value) => total + value, 0)
}

function priorityLabel(score: number) {
  if (score >= 58) return 'Critical'
  if (score >= 36) return 'High'
  if (score >= 18) return 'Medium'
  return 'Low'
}

async function pollConnectionStatus(
  statusUrl: string,
  popup: Window | null,
  timeoutMs: number = 120_000
) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(statusUrl)
      const payload = await response.json().catch(() => null)
      if (payload?.connected) {
        return true
      }
    } catch {}

    if (popup?.closed) {
      try {
        const response = await fetch(statusUrl)
        const payload = await response.json().catch(() => null)
        return Boolean(payload?.connected)
      } catch {
        return false
      }
    }

    await delay(1500)
  }

  return false
}

function formatCalendarTimestamp(value: string, isAllDay: boolean) {
  if (isAllDay) {
    const date = new Date(`${value}T00:00:00`)
    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function parseDurationMinutes(command: string) {
  const match = command.match(
    /\b(\d{1,3})\s*(minute|minutes|min|mins|hour|hours|hr|hrs)\b/i
  )
  if (!match) return 45

  const amount = Number(match[1])
  const unit = match[2]?.toLowerCase() || 'minutes'
  return /hour|hr/.test(unit) ? amount * 60 : amount
}

function parseEventTitle(command: string) {
  const quoted = command.match(/"([^"]+)"/)?.[1]?.trim()
  if (quoted) return quoted

  const byKeyword =
    command.match(/\b(?:called|titled)\s+(.+)$/i)?.[1]?.trim() ||
    command.match(/\bfor\s+(.+)$/i)?.[1]?.trim()

  if (!byKeyword) return 'BrokMail Calendar Event'

  return (
    byKeyword
      .replace(/\b(today|tomorrow)\b/gi, '')
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
      .replace(/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/gi, '')
      .replace(/\b(at|on)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim() || 'BrokMail Calendar Event'
  )
}

function parseTimeParts(command: string) {
  const timeMatch = command.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  if (!timeMatch) {
    return { hour: 9, minute: 0 }
  }

  let hour = Number(timeMatch[1]) % 12
  const minute = Number(timeMatch[2] || '0')
  if ((timeMatch[3] || '').toLowerCase() === 'pm') {
    hour += 12
  }

  return { hour, minute }
}

function parseCalendarStartDate(command: string) {
  const explicit = command.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (explicit) {
    const year = Number(explicit[1])
    const monthIndex = Number(explicit[2]) - 1
    const day = Number(explicit[3])
    const { hour, minute } = parseTimeParts(command)
    return new Date(year, monthIndex, day, hour, minute, 0, 0)
  }

  const now = new Date()
  const base = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    9,
    0,
    0,
    0
  )

  if (/\btomorrow\b/i.test(command)) {
    base.setDate(base.getDate() + 1)
  }

  const { hour, minute } = parseTimeParts(command)
  base.setHours(hour, minute, 0, 0)
  return base
}

function findCalendarEventToDelete(
  command: string,
  events: BrokCalendarEvent[]
): BrokCalendarEvent | null {
  if (events.length === 0) return null

  const eventIdMatch = command.match(/\bid[:\s]+([a-z0-9_\-@.]+)/i)?.[1]
  if (eventIdMatch) {
    return events.find(event => event.id === eventIdMatch) ?? null
  }

  const quoted = command
    .match(/"([^"]+)"/)?.[1]
    ?.trim()
    .toLowerCase()
  if (quoted) {
    return (
      events.find(event => event.summary.toLowerCase().includes(quoted)) || null
    )
  }

  const simplified = command
    .toLowerCase()
    .replace(
      /\b(remove|delete|cancel|event|calendar|meeting|from|my|the|please)\b/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim()

  if (!simplified) return events[0] ?? null

  return (
    events.find(event =>
      simplified
        .split(' ')
        .every(token => event.summary.toLowerCase().includes(token))
    ) || null
  )
}

export function BrokMailApp() {
  const [threads, setThreads] = useState<MailThread[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>()
  const [view, setView] = useState<MailboxView>('inbox')
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<MailSortMode>('priority')
  const [connected, setConnected] = useState(false)
  const [connectionMode, setConnectionMode] =
    useState<IntegrationConnectionMode>('none')
  const [connectionStatus, setConnectionStatus] = useState('Checking Gmail...')
  const [calendarEvents, setCalendarEvents] = useState<BrokCalendarEvent[]>([])
  const [selectedCalendarEventId, setSelectedCalendarEventId] = useState<
    string | null
  >(null)
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [calendarConnectionMode, setCalendarConnectionMode] =
    useState<IntegrationConnectionMode>('none')
  const [calendarConnectionStatus, setCalendarConnectionStatus] = useState(
    'Checking Google Calendar...'
  )
  const [isConnecting, setIsConnecting] = useState(false)
  const [isConnectingCalendar, setIsConnectingCalendar] = useState(false)
  const [isSyncingMail, setIsSyncingMail] = useState(false)
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false)
  const [isSharing, startShareTransition] = useTransition()
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([])
  const [activity, setActivity] = useState<ActivityStep[]>([])
  const [handledApprovalIds, setHandledApprovalIds] = useState<string[]>([])
  const [agentInput, setAgentInput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [composer, setComposer] = useState('')
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Connect Gmail or Google Calendar through Composio to start. BrokMail uses live connected accounts and never uses platform Google OAuth or sample mail.'
    }
  ])
  const deferredQuery = useDeferredValue(query)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const selectedThread = useMemo(
    () => threads.find(thread => thread.id === selectedThreadId) ?? threads[0],
    [selectedThreadId, threads]
  )
  const selectedCalendarEvent = useMemo(
    () =>
      calendarEvents.find(event => event.id === selectedCalendarEventId) ??
      calendarEvents[0] ??
      null,
    [calendarEvents, selectedCalendarEventId]
  )

  const filteredThreads = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase()

    const matches = threads.filter(thread => {
      const matchesView =
        view === 'inbox'
          ? hasLabel(thread, 'INBOX')
          : view === 'needs-reply'
            ? thread.needsReply
            : view === 'follow-ups'
              ? thread.waitingOnReply
              : view === 'sent'
                ? hasLabel(thread, 'SENT')
                : view === 'newsletters'
                  ? thread.category === 'newsletter'
                  : view === 'receipts'
                    ? thread.category === 'receipt'
                    : view === 'calendar'
                      ? false
                      : view === 'drafts'
                        ? false
                        : true

      if (!matchesView) return false
      if (!normalizedQuery) return true

      return [
        thread.sender,
        thread.senderEmail,
        thread.subject,
        thread.snippet,
        thread.aiSummary,
        thread.labels.join(' ')
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    })

    return [...matches].sort((a, b) => {
      if (sortMode === 'sender') {
        return a.sender.localeCompare(b.sender)
      }

      if (sortMode === 'priority') {
        const priorityDelta = scoreThreadPriority(b) - scoreThreadPriority(a)
        if (priorityDelta !== 0) return priorityDelta
      }

      return Number(b.unread) - Number(a.unread)
    })
  }, [deferredQuery, sortMode, threads, view])

  const counts = useMemo(
    () => ({
      inbox: threads.filter(thread => hasLabel(thread, 'INBOX')).length,
      'needs-reply': threads.filter(thread => thread.needsReply).length,
      'follow-ups': threads.filter(thread => thread.waitingOnReply).length,
      drafts: messages.filter(message => message.draft).length,
      sent: threads.filter(thread => hasLabel(thread, 'SENT')).length,
      newsletters: threads.filter(thread => thread.category === 'newsletter')
        .length,
      receipts: threads.filter(thread => thread.category === 'receipt').length,
      calendar: calendarEvents.length,
      automations: automationRules.length
    }),
    [automationRules.length, calendarEvents.length, messages, threads]
  )
  const listCount =
    view === 'calendar' ? calendarEvents.length : filteredThreads.length
  const listLabel = view === 'calendar' ? 'events' : 'conversations'
  const inboxInsights = useMemo(() => {
    const needsReply = threads.filter(thread => thread.needsReply)
    const followUps = threads.filter(thread => thread.waitingOnReply)
    const urgent = [...threads]
      .sort((a, b) => scoreThreadPriority(b) - scoreThreadPriority(a))
      .slice(0, 3)

    return {
      needsReply: needsReply.length,
      followUps: followUps.length,
      unread: threads.filter(thread => thread.unread).length,
      urgent
    }
  }, [threads])

  useEffect(() => {
    void bootstrapGmail()
    const storedAutomations = window.localStorage.getItem(
      'brokmail_automation_rules'
    )

    if (storedAutomations) {
      try {
        const parsed = JSON.parse(storedAutomations)
        if (Array.isArray(parsed)) {
          setAutomationRules(parsed)
        }
      } catch {}
    }

    // BrokMail bootstraps once on mount; refresh is user-driven afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable

      if (event.key === '/' && !isTyping) {
        event.preventDefault()
        searchInputRef.current?.focus()
        return
      }

      if (isTyping) return

      if (event.key.toLowerCase() === 'c') {
        event.preventDefault()
        setComposer('Hi,\n\n\n\nBest,\nAnimesh')
        return
      }

      if (event.key.toLowerCase() === 'j') {
        event.preventDefault()
        selectAdjacentThread(1)
        return
      }

      if (event.key.toLowerCase() === 'k') {
        event.preventDefault()
        selectAdjacentThread(-1)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  })

  async function loadComposioGmailThreads() {
    setConnectionStatus('Loading live Gmail through Composio...')
    try {
      const response = await fetch('/api/brokmail/gmail/threads')
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(
          payload?.error ?? 'Could not load Gmail threads through Composio.'
        )
      }

      const liveThreads = Array.isArray(payload?.threads)
        ? (payload.threads as MailThread[])
        : []

      setThreads(liveThreads)
      if (liveThreads[0]) setSelectedThreadId(liveThreads[0].id)
      if (liveThreads.length) setView(preferredViewForThreads(liveThreads))
      setConnected(true)
      setConnectionMode('composio')
      setConnectionStatus(
        liveThreads.length
          ? `Composio Gmail connected (${liveThreads.length} live threads)`
          : 'Composio Gmail connected, but no recent mail was returned.'
      )
      if (liveThreads.length) {
        toast.success('Loaded live Gmail through Composio')
        setMessages(current => {
          if (current.some(message => message.id === 'gmail-live-ready')) {
            return current
          }

          return [
            ...current,
            {
              id: 'gmail-live-ready',
              role: 'assistant',
              content: `Gmail is live. I loaded ${liveThreads.length} real threads through Composio and selected the highest-signal view. Ask me to triage, summarize, draft, or prepare an approval-safe action.`
            }
          ]
        })
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Could not load Gmail threads through Composio.'
      setThreads([])
      setConnectionStatus(message)
      toast.error(message)
    }
  }

  async function loadComposioCalendarEvents() {
    setIsSyncingCalendar(true)
    setCalendarConnectionStatus(
      'Loading live Google Calendar events through Composio...'
    )

    try {
      const response = await fetch('/api/brokmail/gcal/events')
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(
          payload?.error ??
            'Could not load Google Calendar events through Composio.'
        )
      }

      const liveEvents = Array.isArray(payload?.events)
        ? (payload.events as BrokCalendarEvent[])
        : []

      setCalendarEvents(liveEvents)
      setSelectedCalendarEventId(liveEvents[0]?.id ?? null)
      setCalendarConnected(true)
      setCalendarConnectionMode('composio')
      setCalendarConnectionStatus(
        liveEvents.length
          ? `Composio Calendar connected (${liveEvents.length} upcoming events)`
          : 'Composio Calendar connected, but no upcoming events were returned.'
      )
      if (liveEvents.length)
        toast.success('Loaded live Calendar through Composio')
      return liveEvents
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Could not load Google Calendar events through Composio.'
      setCalendarEvents([])
      setCalendarConnectionStatus(message)
      toast.error(message)
      return []
    } finally {
      setIsSyncingCalendar(false)
    }
  }

  function selectAdjacentThread(direction: 1 | -1) {
    if (filteredThreads.length === 0) return
    const currentIndex = Math.max(
      0,
      filteredThreads.findIndex(thread => thread.id === selectedThread?.id)
    )
    const nextIndex =
      (currentIndex + direction + filteredThreads.length) %
      filteredThreads.length
    setSelectedThreadId(filteredThreads[nextIndex]?.id)
  }

  function toggleThreadStar(threadId: string) {
    setThreads(current =>
      current.map(thread =>
        thread.id === threadId
          ? { ...thread, starred: !thread.starred, important: !thread.starred }
          : thread
      )
    )
  }

  function markThreadDone(threadId: string) {
    setThreads(current =>
      current.map(thread =>
        thread.id === threadId
          ? {
              ...thread,
              unread: false,
              needsReply: false,
              waitingOnReply: false,
              labels: thread.labels.filter(label => label !== 'Inbox')
            }
          : thread
      )
    )
    toast.success('Thread cleared from the active queue')
  }

  function runPriorityBrief() {
    const topSubjects = inboxInsights.urgent
      .map(thread => `- ${thread.sender}: ${thread.subject}`)
      .join('\n')
    runAgent(
      topSubjects
        ? `Prioritize my inbox and tell me what to handle first:\n${topSubjects}`
        : 'Prioritize my inbox and tell me what to handle first.'
    )
  }

  async function bootstrapGmail() {
    window.localStorage.removeItem('brokmail_google_token')
    if (window.location.hash) {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}`
      )
    }

    try {
      const [gmailResponse, gcalResponse] = await Promise.all([
        fetch('/api/brokmail/gmail/status'),
        fetch('/api/brokmail/gcal/status')
      ])
      const gmailStatus = await gmailResponse.json()
      const gcalStatus = await gcalResponse.json()

      if (gmailStatus.connected) {
        setConnected(true)
        setConnectionMode('composio')
        await loadComposioGmailThreads()
      } else {
        setConnectionStatus(
          gmailStatus.message ||
            'Connect Gmail through Composio to load live inbox.'
        )
      }

      if (gcalStatus.connected) {
        setCalendarConnected(true)
        setCalendarConnectionMode('composio')
        await loadComposioCalendarEvents()
      } else {
        setCalendarConnectionStatus(
          gcalStatus.message ||
            'Connect Google Calendar through Composio to use live calendar actions.'
        )
      }
    } catch {
      setConnectionStatus('Connect Gmail to load live mail.')
      setCalendarConnectionStatus(
        'Connect Google Calendar to load live events.'
      )
    }
  }

  async function connectGmail() {
    setIsConnecting(true)
    try {
      const response = await fetch('/api/brokmail/gmail/connect', {
        method: 'POST'
      })
      const body = await response.json().catch(() => null)

      if (!response.ok) {
        const message =
          typeof body?.message === 'string'
            ? body.message
            : 'Sign in to Brok before connecting Gmail.'
        setConnectionStatus(message)
        toast.error(message)
        return
      }

      if (body?.connectionUrl) {
        const popup = window.open(
          body.connectionUrl,
          'brokmail-gmail-connect',
          'popup=yes,width=560,height=760,noopener,noreferrer'
        )

        if (!popup) {
          window.location.href = body.connectionUrl
          return
        }

        setConnectionStatus(
          'Finish Gmail authorization in the popup. I will confirm automatically when the connection is active.'
        )
        toast.info('Complete Gmail authorization in the popup')

        const connectedThroughComposio = await pollConnectionStatus(
          '/api/brokmail/gmail/status',
          popup
        )

        if (!popup.closed) {
          popup.close()
        }

        if (connectedThroughComposio) {
          setConnected(true)
          setConnectionMode('composio')
          await loadComposioGmailThreads()
          toast.success('Gmail connected through Composio')
          return
        }

        setConnectionStatus(
          'Connection was not confirmed yet. Retry Composio after the Gmail account is connected.'
        )
        toast.error('Could not confirm Gmail connection yet')
        return
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not connect Gmail.'
      setConnectionStatus(message)
      toast.error(message)
    } finally {
      setIsConnecting(false)
    }
  }

  async function connectCalendar() {
    setIsConnectingCalendar(true)
    try {
      const response = await fetch('/api/brokmail/gcal/connect', {
        method: 'POST'
      })
      const body = await response.json().catch(() => null)

      if (!response.ok) {
        const message =
          typeof body?.message === 'string'
            ? body.message
            : 'Sign in to Brok before connecting Calendar.'
        setCalendarConnectionStatus(message)
        toast.error(message)
        return
      }

      if (body?.connectionUrl) {
        const popup = window.open(
          body.connectionUrl,
          'brokmail-gcal-connect',
          'popup=yes,width=560,height=760,noopener,noreferrer'
        )

        if (!popup) {
          window.location.href = body.connectionUrl
          return
        }

        setCalendarConnectionStatus(
          'Finish Google Calendar authorization in the popup. I will confirm automatically when active.'
        )
        toast.info('Complete Google Calendar authorization in the popup')

        const connectedThroughComposio = await pollConnectionStatus(
          '/api/brokmail/gcal/status',
          popup
        )

        if (!popup.closed) {
          popup.close()
        }

        if (connectedThroughComposio) {
          setCalendarConnected(true)
          setCalendarConnectionMode('composio')
          await loadComposioCalendarEvents()
          toast.success('Google Calendar connected through Composio')
          return
        }

        setCalendarConnectionStatus(
          'Connection was not confirmed yet. Retry Composio after Calendar is connected.'
        )
        toast.error('Could not confirm Google Calendar connection yet')
        return
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not connect Calendar.'
      setCalendarConnectionStatus(message)
      toast.error(message)
    } finally {
      setIsConnectingCalendar(false)
    }
  }

  function updateActivity(message: string) {
    const id = createId('step')
    setActivity(current => [
      ...current.map(step => ({ ...step, status: 'done' as const })),
      { id, message, status: 'running' }
    ])
  }

  function finishActivity() {
    setActivity(current =>
      current.map(step => ({ ...step, status: 'done' as const }))
    )
  }

  async function askPiBrokMailAgent(command: string) {
    const response = await fetch('/api/brokmail/pi-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: command,
        threads,
        calendarEvents,
        selectedThreadId: selectedThread?.id ?? null,
        selectedEventId: selectedCalendarEvent?.id ?? null
      })
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(
        payload?.error ??
          'Pi-powered BrokMail assistant is not available right now.'
      )
    }

    const content = typeof payload?.content === 'string' ? payload.content : ''
    if (!content.trim()) {
      throw new Error('Pi-powered BrokMail assistant returned no content.')
    }

    return content.trim()
  }

  async function runAgent(prompt: string) {
    const command = prompt.trim()
    if (!command || isRunning) return

    setAgentInput('')
    setIsRunning(true)
    setActivity([])
    setMessages(current => [
      ...current,
      { id: createId('user'), role: 'user', content: command }
    ])

    const wait = (ms: number) =>
      new Promise(resolve => window.setTimeout(resolve, ms))

    updateActivity('Understanding the inbox command...')
    await wait(140)

    const lower = command.toLowerCase()
    const hasMail = threads.length > 0
    let response = ''
    let draft: DraftState | undefined
    let approval: ApprovalState | undefined

    if (
      /calendar|meeting|event|schedule/.test(lower) &&
      (lower.includes('show') ||
        lower.includes('list') ||
        lower.includes('upcoming') ||
        lower.includes('next'))
    ) {
      setView('calendar')
      updateActivity('Checking Composio Calendar connection...')
      await wait(170)
      let liveEvents = calendarEvents
      if (calendarConnectionMode === 'composio') {
        updateActivity('Loading upcoming events from Google Calendar...')
        liveEvents = await loadComposioCalendarEvents()
      }

      response =
        calendarConnectionMode === 'composio'
          ? liveEvents.length
            ? `Google Calendar is live. I loaded ${liveEvents.length} upcoming events from Composio. Select an event to inspect or ask me to add/remove one with approval.`
            : 'Google Calendar is connected through Composio, but no upcoming events were returned.'
          : 'Connect Google Calendar through Composio before using live calendar actions.'
    } else if (
      /calendar|meeting|event|schedule/.test(lower) &&
      (lower.includes('add') ||
        lower.includes('create') ||
        lower.includes('schedule'))
    ) {
      setView('calendar')
      updateActivity('Parsing calendar command...')
      await wait(130)

      if (calendarConnectionMode !== 'composio') {
        response =
          'Connect Google Calendar through Composio before creating live events.'
      } else {
        const summary = parseEventTitle(command)
        const startAt = parseCalendarStartDate(command)
        if (startAt.getTime() < Date.now() - 15 * 60_000) {
          startAt.setDate(startAt.getDate() + 1)
        }
        const durationMinutes = parseDurationMinutes(command)
        const endAt = new Date(startAt.getTime() + durationMinutes * 60_000)

        updateActivity('Preparing a calendar approval card...')
        await wait(170)
        response = [
          'Calendar event ready for approval:',
          `Title: ${summary}`,
          `When: ${formatCalendarTimestamp(startAt.toISOString(), false)}`,
          'Confirm before I add it to Google Calendar.'
        ].join('\n')
        approval = {
          id: createId('approval'),
          title: 'Create Calendar Event?',
          description: `${summary} at ${formatCalendarTimestamp(startAt.toISOString(), false)}.`,
          action: 'calendar_create',
          calendarEvent: {
            summary,
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString()
          }
        }
      }
    } else if (
      /calendar|meeting|event|schedule/.test(lower) &&
      (lower.includes('remove') ||
        lower.includes('delete') ||
        lower.includes('cancel'))
    ) {
      setView('calendar')
      updateActivity('Locating calendar event to remove...')
      await wait(140)

      if (calendarConnectionMode !== 'composio') {
        response =
          'Connect Google Calendar through Composio before removing live events.'
      } else {
        let candidate = findCalendarEventToDelete(command, calendarEvents)

        if (!candidate) {
          response =
            'I could not find that calendar event in the live upcoming-event list. Refresh Calendar, select the event, or quote the event title.'
        } else {
          updateActivity(
            `Preparing removal approval for "${candidate.summary}"...`
          )
          await wait(170)
          response = [
            'Calendar removal ready for approval:',
            `Title: ${candidate.summary}`,
            `When: ${formatCalendarTimestamp(candidate.startAt, candidate.isAllDay)}`,
            'Confirm before I remove it from Google Calendar.'
          ].join('\n')
          approval = {
            id: createId('approval'),
            title: 'Remove Calendar Event?',
            description: `${candidate.summary} at ${formatCalendarTimestamp(candidate.startAt, candidate.isAllDay)}.`,
            action: 'calendar_delete',
            calendarEvent: {
              id: candidate.id,
              summary: candidate.summary,
              startAt: candidate.startAt,
              endAt: candidate.endAt
            }
          }
        }
      }
    } else if (lower.includes('attention') || lower.includes('triage')) {
      updateActivity('Scanning unread, important, and recent threads...')
      await wait(160)
      updateActivity(
        'Asking Pi to classify needs reply, waiting-on, and low-priority mail...'
      )
      await wait(160)
      if (!hasMail) {
        response =
          'Connect Gmail first so I can triage your live inbox. I will not use demo mail data.'
      } else {
        try {
          response = await askPiBrokMailAgent(command)
        } catch (error) {
          response =
            error instanceof Error
              ? error.message
              : 'Pi-powered triage failed. No placeholder triage was generated.'
        }
      }
    } else if (lower.includes('follow')) {
      updateActivity('Checking sent conversations without a recent reply...')
      await wait(170)
      const followUps = threads.filter(thread => thread.waitingOnReply)
      if (followUps[0]) setSelectedThreadId(followUps[0].id)
      if (!hasMail) {
        response =
          'Connect Gmail first so I can scan your real sent mail for follow-ups.'
      } else {
        try {
          response = await askPiBrokMailAgent(command)
        } catch (error) {
          response =
            error instanceof Error
              ? error.message
              : 'Pi-powered follow-up scan failed. No placeholder follow-up list was generated.'
        }
      }
    } else if (lower.includes('archive') || lower.includes('newsletter')) {
      updateActivity('Searching newsletter-like emails older than 30 days...')
      await wait(150)
      updateActivity('Excluding starred and important emails...')
      await wait(150)
      const archiveCount = threads.filter(
        thread =>
          thread.category === 'newsletter' &&
          !thread.starred &&
          !thread.important
      ).length
      response = hasMail
        ? `I found ${archiveCount} newsletter-like email ready to archive. Starred and important messages are excluded.`
        : 'Connect Gmail first so I can search and archive real newsletter threads.'
      if (hasMail) {
        approval = {
          id: createId('approval'),
          title: 'Confirm Archive',
          description:
            'Archive newsletter-like emails older than 30 days, excluding starred and important messages.',
          action: 'archive',
          count: archiveCount,
          targetThreadIds: threads
            .filter(
              thread =>
                thread.category === 'newsletter' &&
                !thread.starred &&
                !thread.important
            )
            .map(thread => thread.id)
        }
      }
    } else if (lower.includes('receipt') || lower.includes('automation')) {
      updateActivity('Building an automation preview...')
      await wait(160)
      response =
        'Automation preview: when a new email looks like a receipt or invoice, label it Expenses. This rule is low risk and can run without send/delete access.'
      approval = {
        id: createId('approval'),
        title: 'Create Automation',
        description:
          'When a new email appears to be a receipt or invoice, apply the Expenses label.',
        action: 'automation'
      }
    } else if (
      (lower.includes('find') ||
        lower.includes('search') ||
        lower.includes('contract')) &&
      (lower.includes('draft') || lower.includes('reply'))
    ) {
      updateActivity(
        'Searching Gmail-style metadata for the contract thread...'
      )
      await wait(140)
      const match =
        threads.find(thread =>
          `${thread.sender} ${thread.subject} ${thread.snippet}`
            .toLowerCase()
            .includes('contract')
        ) ?? selectedThread
      if (!match) {
        response =
          'Connect Gmail first so I can search real threads and draft from actual email context.'
      } else {
        setSelectedThreadId(match.id)
        updateActivity('Reading the best matching thread...')
        await wait(140)
        updateActivity(
          'Asking Pi to summarize context and draft a safe reply...'
        )
        await wait(180)
        try {
          const draftBody = await askPiBrokMailAgent(
            `${command}\n\nDraft a reply for this matched thread. Return only the draft body.`
          )
          draft = {
            subject: `Re: ${match.subject}`,
            body: draftBody,
            threadId: match.id
          }
          setComposer(draft.body)
          response = `${match.sender} - ${match.subject}\nFound because it mentions the contract and has ${match.hasAttachments ? 'an attachment' : 'matching context'}.\n\nPi drafted the reply for review.`
          approval = {
            id: createId('approval'),
            title: 'Create Gmail Draft?',
            description:
              'This creates a Gmail draft in the current live thread. It does not send email.',
            action: 'send',
            targetThreadIds: [match.id]
          }
        } catch (error) {
          response =
            error instanceof Error
              ? error.message
              : 'Pi-powered drafting failed. No placeholder draft was generated.'
        }
      }
    } else if (
      lower.includes('find') ||
      lower.includes('search') ||
      lower.includes('contract')
    ) {
      updateActivity('Searching mail metadata and thread snippets...')
      await wait(140)
      const match =
        threads.find(thread =>
          `${thread.sender} ${thread.subject} ${thread.snippet}`
            .toLowerCase()
            .includes('contract')
        ) ?? selectedThread
      if (!match) {
        response = 'Connect Gmail first so I can search your real mailbox.'
      } else {
        setSelectedThreadId(match.id)
        updateActivity('Opening the most relevant thread...')
        await wait(120)
        try {
          const piSummary = await askPiBrokMailAgent(
            `${command}\n\nExplain why this matched thread is relevant and summarize the next action.`
          )
          response = `${match.sender} - ${match.subject}\nFound because it mentions the contract and has ${match.hasAttachments ? 'an attachment' : 'matching context'}.\n\n${piSummary}`
        } catch (error) {
          response =
            error instanceof Error
              ? error.message
              : 'Pi-powered search summary failed. No placeholder summary was generated.'
        }
      }
    } else if (lower.includes('draft') || lower.includes('reply')) {
      updateActivity('Reading the selected thread before drafting...')
      await wait(150)
      updateActivity('Asking Pi to write a concise reply in your saved tone...')
      await wait(180)
      if (!selectedThread) {
        response =
          'Connect Gmail and select a live thread before drafting. I always read the real thread before writing.'
      } else {
        try {
          const draftBody = await askPiBrokMailAgent(
            `${command}\n\nDraft a reply for the selected thread. Return only the draft body.`
          )
          draft = {
            subject: `Re: ${selectedThread.subject}`,
            body: draftBody,
            threadId: selectedThread.id
          }
          setComposer(draft.body)
          response =
            'Pi drafted a reply from the selected thread. Review it below before sending or saving.'
          approval = {
            id: createId('approval'),
            title: 'Create Gmail Draft?',
            description:
              'This creates a Gmail draft in the selected live thread. It does not send email.',
            action: 'send',
            targetThreadIds: [selectedThread.id]
          }
        } catch (error) {
          response =
            error instanceof Error
              ? error.message
              : 'Pi-powered drafting failed. No placeholder draft was generated.'
        }
      }
    } else {
      updateActivity('Reading the selected thread with Pi...')
      await wait(150)
      if (!selectedThread) {
        response =
          'Connect Gmail first or select a live thread so I can summarize real email context.'
      } else {
        try {
          response = await askPiBrokMailAgent(command)
        } catch (error) {
          response =
            error instanceof Error
              ? error.message
              : 'Pi-powered thread summary failed. No placeholder summary was generated.'
        }
      }
    }

    finishActivity()
    setMessages(current => [
      ...current,
      {
        id: createId('assistant'),
        role: 'assistant',
        content: response,
        draft,
        approval
      }
    ])
    setIsRunning(false)
  }

  async function approveAction(approval: ApprovalState, draft?: DraftState) {
    if (handledApprovalIds.includes(approval.id)) {
      toast.info('This approval has already been handled.')
      return
    }

    if (approval.action === 'archive') {
      const targetThreads = (
        approval.targetThreadIds?.length
          ? threads.filter(thread =>
              approval.targetThreadIds?.includes(thread.id)
            )
          : selectedThread
            ? [selectedThread]
            : []
      ) as MailThread[]

      if (targetThreads.length === 0) {
        toast.error('Choose real thread targets before archiving in Gmail.')
        return
      }

      try {
        if (connectionMode === 'composio') {
          await executeComposioBrokMailAction({
            action: 'archive_threads',
            threads: targetThreads,
            approval
          })
        } else {
          toast.error(
            'Load live inbox or connect Gmail through Composio before archiving.'
          )
          return
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Could not archive in Gmail.'
        )
        return
      }
      setThreads(current =>
        current.map(thread =>
          targetThreads.some(target => target.id === thread.id)
            ? {
                ...thread,
                labels: thread.labels.filter(label => label !== 'Inbox')
              }
            : thread
        )
      )
      toast.success('Archived through Composio')
    }

    if (approval.action === 'send') {
      const targetThread =
        (approval.targetThreadIds?.[0]
          ? threads.find(thread => thread.id === approval.targetThreadIds?.[0])
          : null) ?? selectedThread

      if (!draft || !targetThread) {
        toast.error('Select a real thread before creating a Gmail draft.')
        return
      }

      try {
        if (connectionMode === 'composio') {
          await executeComposioBrokMailAction({
            action: 'create_draft',
            threads: [targetThread],
            draftBody: draft.body,
            approval
          })
        } else {
          toast.error(
            'Load live inbox or connect Gmail through Composio before creating a draft.'
          )
          return
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Could not create Gmail draft.'
        )
        return
      }
      toast.success('Composio created the Gmail draft')
    }

    if (approval.action === 'calendar_create') {
      if (!approval.calendarEvent?.startAt) {
        toast.error('Calendar event start time is required.')
        return
      }

      try {
        if (calendarConnectionMode === 'composio') {
          await executeComposioBrokMailAction({
            action: 'create_calendar_event',
            calendarEvent: approval.calendarEvent,
            approval
          })
          setCalendarConnected(true)
          await loadComposioCalendarEvents()
          toast.success('Composio created the Google Calendar event')
        } else {
          toast.error(
            'Load live calendar or connect Calendar through Composio before creating events.'
          )
          return
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Could not create event.'
        )
        return
      }
    }

    if (approval.action === 'calendar_delete') {
      if (!approval.calendarEvent?.id) {
        toast.error('Calendar event id is required.')
        return
      }

      try {
        if (calendarConnectionMode === 'composio') {
          await executeComposioBrokMailAction({
            action: 'delete_calendar_event',
            calendarEvent: approval.calendarEvent,
            approval
          })
          setCalendarEvents(current =>
            current.filter(event => event.id !== approval.calendarEvent?.id)
          )
          toast.success('Composio removed the Google Calendar event')
        } else {
          toast.error(
            'Load live calendar or connect Calendar through Composio before removing events.'
          )
          return
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Could not remove event.'
        )
        return
      }
    }

    if (approval.action === 'automation') {
      const rule: AutomationRule = {
        id: approval.id,
        name: approval.title,
        trigger: 'New email arrives',
        condition: approval.description,
        action: 'Apply Expenses label',
        approval: 'Not required',
        enabled: true,
        lastRun: 'Never'
      }
      setAutomationRules(current => {
        const next = [rule, ...current.filter(item => item.id !== rule.id)]
        window.localStorage.setItem(
          'brokmail_automation_rules',
          JSON.stringify(next)
        )
        return next
      })
      toast.success('Automation created')
    }

    setMessages(current => [
      ...current,
      {
        id: createId('assistant'),
        role: 'assistant',
        content: `${approval.title} approved. I logged the action and kept the approval trail.`
      }
    ])
    setHandledApprovalIds(current => [...current, approval.id])
  }

  function cancelAction(approval: ApprovalState) {
    setHandledApprovalIds(current =>
      current.includes(approval.id) ? current : [...current, approval.id]
    )
    setMessages(current => [
      ...current,
      {
        id: createId('assistant'),
        role: 'assistant',
        content: `${approval.title} cancelled. No Gmail or Calendar action was taken.`
      }
    ])
  }

  function insertDraft(draft: DraftState) {
    setComposer(draft.body)
    toast.success('Draft inserted into composer')
  }

  function requestComposerSendApproval() {
    if (!selectedThread || !composer.trim()) {
      toast.info('Select a live thread and write a draft first.')
      return
    }

    const draft: DraftState = {
      subject: `Re: ${selectedThread.subject.replace(/^Re:\s*/i, '')}`,
      body: composer,
      threadId: selectedThread.id
    }

    setMessages(current => [
      ...current,
      {
        id: createId('assistant'),
        role: 'assistant',
        content:
          'Ready to create this as a Gmail draft. Confirm first, then you can review and send it from Gmail.',
        draft,
        approval: {
          id: createId('approval'),
          title: 'Create Gmail Draft?',
          description:
            'This creates a Gmail draft in the selected live thread. It does not send email.',
          action: 'send',
          targetThreadIds: [selectedThread.id]
        }
      }
    ])
  }

  function saveComposerDraft() {
    if (!composer.trim() || !selectedThread) return
    requestComposerSendApproval()
  }

  function rewriteComposer(style: 'shorter' | 'warmer' | 'direct') {
    if (!composer.trim()) return

    const rewritten =
      style === 'shorter'
        ? composer
            .split('\n')
            .filter(line => line.trim())
            .slice(0, 4)
            .join('\n\n')
        : style === 'warmer'
          ? composer.replace('Thanks', 'Thanks so much')
          : composer.replace('Could you please', 'Please')

    setComposer(rewritten)
    toast.success(`Made draft ${style}`)
  }

  async function shareBrokMailChat() {
    const transcript = messages
      .map(message => ({
        role: message.role,
        content: [
          message.content,
          message.draft
            ? [
                '',
                'Draft:',
                `Subject: ${message.draft.subject}`,
                message.draft.body
              ].join('\n')
            : '',
          message.approval
            ? [
                '',
                'Approval:',
                `${message.approval.title} - ${message.approval.description}`
              ].join('\n')
            : ''
        ]
          .filter(Boolean)
          .join('\n')
      }))
      .filter(entry => entry.content.trim().length > 0)

    if (transcript.length === 0) {
      toast.error('No chat messages to share yet.')
      return
    }

    const title = selectedThread
      ? `BrokMail: ${selectedThread.subject}`
      : 'BrokMail Chat'

    let sharedChat: Awaited<
      ReturnType<typeof createShareableChatFromTranscript>
    > = null
    try {
      sharedChat = await createShareableChatFromTranscript(transcript, title)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not create share link.'
      )
      return
    }

    if (!sharedChat) {
      toast.error('Could not create a share link. Make sure you are logged in.')
      return
    }

    const shareUrl = new URL(
      `/search/${sharedChat.id}`,
      window.location.origin
    ).toString()

    const copiedToClipboard = await safeCopyTextToClipboard(shareUrl)
    if (copiedToClipboard) {
      toast.success('BrokMail chat link copied')
      return
    }

    window.open(shareUrl, '_blank', 'noopener,noreferrer')
    toast.success('Opened share link. Copy it from the address bar.')
  }

  return (
    <div className="dashboard-shell brokmail-shell flex h-full w-full flex-col overflow-hidden pt-12 text-foreground lg:flex-row">
      <aside className="dashboard-rail flex max-h-[44dvh] shrink-0 flex-col border-b lg:max-h-none lg:w-[340px] lg:border-b-0 lg:border-r 2xl:w-[380px]">
        <AgentPanel
          activity={activity}
          agentInput={agentInput}
          calendarConnected={calendarConnected}
          connected={connected}
          connectionMode={connectionMode}
          isSharing={isSharing}
          isRunning={isRunning}
          messages={messages}
          threadCount={threads.length}
          runAgent={runAgent}
          setAgentInput={setAgentInput}
          insertDraft={insertDraft}
          approveAction={approveAction}
          cancelAction={cancelAction}
          handledApprovalIds={handledApprovalIds}
          onShare={() => {
            startShareTransition(() => {
              void shareBrokMailChat()
            })
          }}
        />
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <BrokMailStatusBar
          connected={connected}
          connectionMode={connectionMode}
          connectionStatus={connectionStatus}
          calendarConnected={calendarConnected}
          calendarConnectionMode={calendarConnectionMode}
          calendarConnectionStatus={calendarConnectionStatus}
          counts={counts}
          insights={inboxInsights}
          isRunning={isRunning}
          runAgent={runAgent}
          runPriorityBrief={runPriorityBrief}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col 2xl:flex-row">
          <aside className="dashboard-rail hidden w-52 shrink-0 border-r 2xl:flex 2xl:flex-col">
            <div className="border-b p-3">
              <Button
                className="h-9 w-full gap-2"
                onClick={() => setComposer('Hi,\n\n\n\nBest,\nAnimesh')}
              >
                <PenLine className="size-4" />
                Compose
              </Button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-2">
              {viewLabels.map(item => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    className={cn(
                      'flex h-9 w-full items-center justify-between rounded-md px-2 text-sm transition-colors hover:bg-muted/70',
                      view === item.id && 'dashboard-pill-active font-medium'
                    )}
                    onClick={() => setView(item.id)}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon className="size-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {counts[item.id]}
                    </span>
                  </button>
                )
              })}
            </nav>

            <div className="border-t p-3">
              <div className="space-y-3">
                <div className="dashboard-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium">Gmail</p>
                      <p className="text-xs text-muted-foreground">
                        {connected ? 'Connected' : 'Not connected'}
                      </p>
                    </div>
                    <Badge variant={connected ? 'default' : 'outline'}>
                      {modeLabel(connectionMode)}
                    </Badge>
                  </div>
                  <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
                    {connectionStatus}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 h-8 w-full gap-2"
                    onClick={connectGmail}
                    disabled={isConnecting}
                  >
                    <UserRoundCheck className="size-4" />
                    {isConnecting ? 'Connecting...' : 'Connect Gmail'}
                  </Button>
                  {connectionMode === 'composio' && (
                    <Button
                      size="sm"
                      className="mt-2 h-8 w-full gap-2"
                      onClick={() => {
                        void loadComposioGmailThreads()
                      }}
                      disabled={isConnecting}
                    >
                      <MailCheck className="size-4" />
                      Load Composio Inbox
                    </Button>
                  )}
                </div>
                <div className="dashboard-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium">Google Calendar</p>
                      <p className="text-xs text-muted-foreground">
                        {calendarConnected ? 'Connected' : 'Not connected'}
                      </p>
                    </div>
                    <Badge variant={calendarConnected ? 'default' : 'outline'}>
                      {modeLabel(calendarConnectionMode)}
                    </Badge>
                  </div>
                  <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
                    {calendarConnectionStatus}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 h-8 w-full gap-2"
                    onClick={connectCalendar}
                    disabled={isConnectingCalendar}
                  >
                    <CalendarDays className="size-4" />
                    {isConnectingCalendar
                      ? 'Connecting...'
                      : 'Connect Calendar'}
                  </Button>
                </div>
              </div>
            </div>
          </aside>

          <div className="dashboard-rail border-b px-3 py-3 2xl:hidden">
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button
                  className="h-9 flex-1 gap-2"
                  onClick={() => setComposer('Hi,\n\n\n\nBest,\nAnimesh')}
                >
                  <PenLine className="size-4" />
                  Compose
                </Button>
                <Button
                  variant="outline"
                  className="h-9 flex-1 gap-2"
                  onClick={() => {
                    void connectGmail()
                  }}
                  disabled={isConnecting}
                >
                  <UserRoundCheck className="size-4" />
                  {isConnecting
                    ? 'Connecting...'
                    : connected
                      ? 'Gmail Ready'
                      : 'Connect Gmail'}
                </Button>
                <Button
                  variant="outline"
                  className="h-9 flex-1 gap-2"
                  onClick={() => {
                    void connectCalendar()
                  }}
                  disabled={isConnectingCalendar}
                >
                  <CalendarDays className="size-4" />
                  {isConnectingCalendar
                    ? 'Connecting...'
                    : calendarConnected
                      ? 'Calendar Ready'
                      : 'Connect Calendar'}
                </Button>
              </div>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {viewLabels.map(item => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.id}
                      className={cn(
                        'flex h-9 shrink-0 items-center gap-2 rounded-md border border-border/70 bg-card/88 px-3 text-sm transition-colors hover:bg-muted/70',
                        view === item.id
                          ? 'dashboard-pill-active font-medium'
                          : 'text-muted-foreground'
                      )}
                      onClick={() => setView(item.id)}
                    >
                      <Icon className="size-4" />
                      <span>{item.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {counts[item.id]}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="flex max-h-[34dvh] w-full shrink-0 flex-col border-b 2xl:max-h-none 2xl:w-[360px] 2xl:border-b-0 2xl:border-r">
            <div className="border-b p-3">
              <div className="flex items-center gap-2">
                <Search className="size-4 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Search mail/calendar or ask BrokMail..."
                  className="h-9 min-w-0"
                />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {listCount} {listLabel}
                </span>
                <span className="flex items-center gap-1">
                  <Command className="size-3" /> Command ready
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2 overflow-x-auto">
                <ArrowDownUp className="size-3.5 shrink-0 text-muted-foreground" />
                {sortOptions.map(option => (
                  <button
                    key={option.id}
                    className={cn(
                      'h-7 shrink-0 rounded-md border px-2 text-xs transition-colors hover:bg-muted/70',
                      sortMode === option.id
                        ? 'dashboard-pill-active font-medium'
                        : 'border-border/70 text-muted-foreground'
                    )}
                    onClick={() => setSortMode(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {view === 'automations' ? (
                <AutomationList rules={automationRules} />
              ) : view === 'calendar' ? (
                <CalendarEventList
                  events={calendarEvents}
                  selectedEventId={selectedCalendarEvent?.id || null}
                  isSyncing={isSyncingCalendar}
                  onSelect={eventId => setSelectedCalendarEventId(eventId)}
                />
              ) : view === 'drafts' ? (
                <DraftList messages={messages} onInsert={insertDraft} />
              ) : filteredThreads.length > 0 ? (
                filteredThreads.map(thread => {
                  const priorityScore = scoreThreadPriority(thread)
                  return (
                    <article
                      key={thread.id}
                      className={cn(
                        'border-b border-border/65 transition-colors hover:bg-muted/70',
                        selectedThread?.id === thread.id &&
                          'dashboard-list-row-active'
                      )}
                    >
                      <button
                        className="block w-full p-3 text-left"
                        onClick={() => setSelectedThreadId(thread.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p
                                className={cn(
                                  'truncate text-sm',
                                  thread.unread && 'font-semibold'
                                )}
                              >
                                {thread.sender}
                              </p>
                              {thread.starred && (
                                <Star className="size-3.5 fill-amber-400 text-amber-500" />
                              )}
                              {thread.hasAttachments && (
                                <Paperclip className="size-3.5 text-muted-foreground" />
                              )}
                            </div>
                            <p className="mt-1 truncate text-sm font-medium">
                              {thread.subject}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className="block text-xs text-muted-foreground">
                              {thread.receivedAt}
                            </span>
                            <Badge
                              variant={
                                priorityScore >= 36 ? 'default' : 'secondary'
                              }
                              className="mt-1 rounded-md px-1.5 py-0 text-[10px]"
                            >
                              {priorityLabel(priorityScore)}
                            </Badge>
                          </div>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {thread.snippet}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge
                            variant={
                              thread.needsReply ? 'default' : 'secondary'
                            }
                            className="max-w-full truncate rounded-md px-2 py-0 text-[11px]"
                          >
                            AI: {thread.aiSummary}
                          </Badge>
                        </div>
                      </button>
                      <div className="flex items-center gap-1 px-3 pb-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs"
                          onClick={() => toggleThreadStar(thread.id)}
                        >
                          <Star
                            className={cn(
                              'size-3.5',
                              thread.starred && 'fill-amber-400 text-amber-500'
                            )}
                          />
                          Focus
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs"
                          onClick={() => markThreadDone(thread.id)}
                        >
                          <CheckCircle2 className="size-3.5" />
                          Done
                        </Button>
                      </div>
                    </article>
                  )
                })
              ) : (
                <div className="flex h-full min-h-40 items-center justify-center p-5 text-center">
                  <div>
                    <Search className="mx-auto mb-3 size-5 text-muted-foreground" />
                    <p className="text-sm font-medium">
                      {query.trim()
                        ? 'No conversations match this search.'
                        : 'No live inbox threads loaded yet.'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {query.trim()
                        ? 'Try a sender, subject, label, or ask BrokMail directly.'
                        : 'Connect Gmail to pull real threads into this workspace.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {view === 'calendar' ? (
              <CalendarWorkspace
                events={calendarEvents}
                selectedEvent={selectedCalendarEvent}
                connectionMode={calendarConnectionMode}
                connectionStatus={calendarConnectionStatus}
                connected={calendarConnected}
                isSyncing={isSyncingCalendar}
                isConnecting={isConnectingCalendar}
                connectCalendar={connectCalendar}
                runAgent={runAgent}
              />
            ) : selectedThread ? (
              <ThreadView
                thread={selectedThread}
                composer={composer}
                setComposer={setComposer}
                runAgent={runAgent}
                rewriteComposer={rewriteComposer}
                saveComposerDraft={saveComposerDraft}
                requestComposerSendApproval={requestComposerSendApproval}
                gmailConnected={connected}
                isSyncingMail={isSyncingMail}
                onToggleStar={() => toggleThreadStar(selectedThread.id)}
                onMarkDone={() => markThreadDone(selectedThread.id)}
              />
            ) : (
              <EmptyMailWorkspace
                connected={connected}
                connectionStatus={connectionStatus}
                connectGmail={connectGmail}
                syncGmail={loadComposioGmailThreads}
                canSyncGmail={connectionMode === 'composio'}
                isConnecting={isConnecting}
                isSyncingMail={isSyncingMail}
                runAgent={runAgent}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

function modeLabel(mode: IntegrationConnectionMode) {
  if (mode === 'composio') return 'Composio'
  return 'Ready'
}

function BrokMailStatusBar({
  connected,
  connectionMode,
  connectionStatus,
  calendarConnected,
  calendarConnectionMode,
  calendarConnectionStatus,
  counts,
  insights,
  isRunning,
  runAgent,
  runPriorityBrief
}: {
  connected: boolean
  connectionMode: IntegrationConnectionMode
  connectionStatus: string
  calendarConnected: boolean
  calendarConnectionMode: IntegrationConnectionMode
  calendarConnectionStatus: string
  counts: Record<MailboxView, number>
  insights: {
    needsReply: number
    followUps: number
    unread: number
    urgent: MailThread[]
  }
  isRunning: boolean
  runAgent: (prompt: string) => void
  runPriorityBrief: () => void
}) {
  return (
    <div className="dashboard-rail border-b px-3 py-2.5 sm:px-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid min-w-0 gap-2 sm:grid-cols-3 xl:flex xl:items-center">
          <div className="min-w-0 rounded-md border border-border/70 bg-background/65 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">Inbox</span>
              <Badge variant={connected ? 'default' : 'outline'}>
                {modeLabel(connectionMode)}
              </Badge>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {connectionStatus}
            </p>
          </div>
          <div className="min-w-0 rounded-md border border-border/70 bg-background/65 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">Calendar</span>
              <Badge variant={calendarConnected ? 'default' : 'outline'}>
                {modeLabel(calendarConnectionMode)}
              </Badge>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {calendarConnectionStatus}
            </p>
          </div>
          <div className="rounded-md border border-border/70 bg-background/65 px-3 py-2">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium">Queue</span>
              <span className="text-muted-foreground">
                {counts['needs-reply']} replies · {counts['follow-ups']}{' '}
                follow-ups
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {isRunning ? 'BrokMail is working...' : 'Ready for commands'}
            </p>
          </div>
          <button
            className="rounded-md border border-border/70 bg-background/65 px-3 py-2 text-left transition-colors hover:bg-muted/70"
            onClick={runPriorityBrief}
            disabled={isRunning}
          >
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-1 font-medium">
                <Flame className="size-3.5" />
                Focus Brief
              </span>
              <span className="text-muted-foreground">
                {insights.unread} unread
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {insights.needsReply} replies · {insights.followUps} waiting
            </p>
          </button>
        </div>

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 xl:mx-0 xl:pb-0">
          {commandPrompts.map(prompt => (
            <Button
              key={prompt}
              variant="outline"
              size="sm"
              className="h-8 shrink-0"
              onClick={() => runAgent(prompt)}
              disabled={isRunning}
            >
              {prompt}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}

function ThreadView({
  thread,
  composer,
  setComposer,
  runAgent,
  rewriteComposer,
  saveComposerDraft,
  requestComposerSendApproval,
  gmailConnected,
  isSyncingMail,
  onToggleStar,
  onMarkDone
}: {
  thread: MailThread
  composer: string
  setComposer: (value: string) => void
  runAgent: (prompt: string) => void
  rewriteComposer: (style: 'shorter' | 'warmer' | 'direct') => void
  saveComposerDraft: () => void
  requestComposerSendApproval: () => void
  gmailConnected: boolean
  isSyncingMail: boolean
  onToggleStar: () => void
  onMarkDone: () => void
}) {
  const priorityScore = scoreThreadPriority(thread)
  const composerStats = {
    words: composer.trim() ? composer.trim().split(/\s+/).length : 0,
    characters: composer.length
  }
  const hasQuestion = /\?/.test(composer)
  const hasGreeting = /^(hi|hello|hey|thanks|thank you|good)/i.test(
    composer.trim()
  )

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="border-b px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Mail className="size-3.5" />
              <span className="break-all">{thread.senderEmail}</span>
              {gmailConnected && (
                <Badge variant="outline" className="rounded-md">
                  Live Gmail
                </Badge>
              )}
              {isSyncingMail && <span>Syncing...</span>}
            </div>
            <h1 className="mt-1 truncate text-lg font-semibold sm:text-xl">
              {thread.subject}
            </h1>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-2 sm:flex-none"
              onClick={onToggleStar}
            >
              <Star
                className={cn(
                  'size-4',
                  thread.starred && 'fill-amber-400 text-amber-500'
                )}
              />
              Focus
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-2 sm:flex-none"
              onClick={() => runAgent('Summarize this thread.')}
            >
              <Sparkles className="size-4" />
              Summarize
            </Button>
            <Button
              size="sm"
              className="flex-1 gap-2 sm:flex-none"
              onClick={() => runAgent('Draft a reply to this thread.')}
            >
              <Reply className="size-4" />
              Draft
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="hidden gap-2 lg:flex"
              onClick={onMarkDone}
            >
              <CheckCircle2 className="size-4" />
              Done
            </Button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-[0.8fr_1fr_1fr]">
          <div className="dashboard-card p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium">
              <Flame className="size-3.5" />
              Triage Score
            </div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-2xl font-semibold">{priorityScore}</p>
                <p className="text-xs text-muted-foreground">
                  {priorityLabel(priorityScore)} priority
                </p>
              </div>
              <Badge variant={thread.needsReply ? 'default' : 'secondary'}>
                {thread.needsReply ? 'Reply' : 'Monitor'}
              </Badge>
            </div>
          </div>
          <div className="dashboard-card p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium">
              <Sparkles className="size-3.5" />
              AI Summary
            </div>
            <p className="text-sm text-muted-foreground">{thread.aiSummary}</p>
          </div>
          <div className="dashboard-card p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium">
              <CheckCircle2 className="size-3.5" />
              Action Items
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              {thread.actionItems.length ? (
                thread.actionItems.map(item => <p key={item}>{item}</p>)
              ) : (
                <p>No action needed.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
        <div className="mx-auto max-w-3xl space-y-3">
          {thread.messages.map(message => (
            <article key={message.id} className="dashboard-card p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{message.from}</p>
                  <p className="text-xs text-muted-foreground">
                    to {message.to.join(', ')}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {message.sentAt}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6">
                {message.body}
              </p>
            </article>
          ))}

          <section className="dashboard-card p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <PenLine className="size-4" />
                <p className="text-sm font-medium">Reply Composer</p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => rewriteComposer('shorter')}
                >
                  Shorter
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => rewriteComposer('warmer')}
                >
                  Warmer
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => rewriteComposer('direct')}
                >
                  Direct
                </Button>
              </div>
            </div>
            <Textarea
              value={composer}
              onChange={event => setComposer(event.target.value)}
              placeholder="Draft or insert a reply..."
              className="min-h-36 resize-none"
            />
            <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
              <div className="rounded-md border border-border/70 bg-background/60 px-2 py-1.5">
                {composerStats.words} words · {composerStats.characters} chars
              </div>
              <div
                className={cn(
                  'rounded-md border px-2 py-1.5',
                  hasGreeting
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-border/70 bg-background/60'
                )}
              >
                {hasGreeting ? 'Human opener' : 'Add a warmer opener'}
              </div>
              <div
                className={cn(
                  'rounded-md border px-2 py-1.5',
                  hasQuestion
                    ? 'border-sky-200 bg-sky-50 text-sky-800'
                    : 'border-border/70 bg-background/60'
                )}
              >
                {hasQuestion ? 'Clear ask included' : 'No direct ask yet'}
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Tone: {brokMailTonePreference}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={saveComposerDraft}
                >
                  <FileText className="size-4" />
                  Save Draft
                </Button>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={requestComposerSendApproval}
                  disabled={!composer.trim()}
                >
                  <ShieldCheck className="size-4" />
                  Send With Approval
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

function AgentPanel({
  activity,
  agentInput,
  calendarConnected,
  connected,
  connectionMode,
  isSharing,
  isRunning,
  messages,
  threadCount,
  runAgent,
  setAgentInput,
  insertDraft,
  approveAction,
  cancelAction,
  handledApprovalIds,
  onShare
}: {
  activity: ActivityStep[]
  agentInput: string
  calendarConnected: boolean
  connected: boolean
  connectionMode: IntegrationConnectionMode
  isSharing: boolean
  isRunning: boolean
  messages: AgentMessage[]
  threadCount: number
  runAgent: (prompt: string) => void
  setAgentInput: (value: string) => void
  insertDraft: (draft: DraftState) => void
  approveAction: (approval: ApprovalState, draft?: DraftState) => void
  cancelAction: (approval: ApprovalState) => void
  handledApprovalIds: string[]
  onShare: () => void
}) {
  const messageEndRef = useRef<HTMLDivElement | null>(null)
  const runtimeLabel =
    connected && connectionMode === 'composio'
      ? 'Composio Gmail'
      : connected
        ? 'Live Gmail'
        : 'Not connected'

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: 'end' })
  }, [activity.length, messages.length])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="relative inline-flex size-8 items-center justify-center rounded-lg border border-border/70 bg-background shadow-sm">
              <Bot className="size-4" />
              {connected && (
                <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
              )}
            </span>
            <div>
              <h2 className="font-semibold leading-none">BrokMail Agent</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {isRunning ? 'Working in Pi runtime' : runtimeLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-md">
              Safe mode
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2"
              onClick={onShare}
              disabled={isSharing}
            >
              <Share2 className="size-4" />
              {isSharing ? 'Sharing...' : 'Share'}
            </Button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border/65 bg-background/72 px-2.5 py-2">
            <p className="text-[10px] uppercase text-muted-foreground">Mail</p>
            <p className="mt-1 truncate text-xs font-medium">
              {connected ? `${threadCount} live threads` : 'Disconnected'}
            </p>
          </div>
          <div className="rounded-lg border border-border/65 bg-background/72 px-2.5 py-2">
            <p className="text-[10px] uppercase text-muted-foreground">
              Calendar
            </p>
            <p className="mt-1 truncate text-xs font-medium">
              {calendarConnected ? 'Connected' : 'Waiting'}
            </p>
          </div>
          <div className="rounded-lg border border-border/65 bg-background/72 px-2.5 py-2">
            <p className="text-[10px] uppercase text-muted-foreground">
              Actions
            </p>
            <p className="mt-1 truncate text-xs font-medium">Approval gated</p>
          </div>
        </div>
        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {quickPrompts.map(prompt => (
            <button
              key={prompt}
              className="dashboard-card shrink-0 px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted/70"
              onClick={() => runAgent(prompt)}
              disabled={isRunning}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
        {activity.length > 0 && (
          <div className="dashboard-card p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Wand2 className="size-4" />
              Agent Activity
            </div>
            <div className="space-y-2">
              {activity.map(step => (
                <div
                  key={step.id}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  {step.status === 'done' ? (
                    <CheckCircle2 className="size-3.5 text-emerald-600" />
                  ) : (
                    <span className="size-2 rounded-full bg-primary" />
                  )}
                  <span>{step.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {messages.map(message => (
          <article
            key={message.id}
            className={cn(
              'flex',
              message.role === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            <div
              className={cn(
                'max-w-[92%] rounded-md border border-border/70 p-3 text-sm sm:max-w-[88%]',
                message.role === 'user'
                  ? 'border-sky-200 bg-sky-50 text-sky-950'
                  : 'bg-card/95'
              )}
            >
              <p className="whitespace-pre-wrap break-words leading-6">
                {message.content}
              </p>
              {message.draft && (
                <div className="mt-3 rounded-md border bg-muted/40 p-3 text-foreground">
                  <div className="mb-2 flex items-center gap-2 font-medium">
                    <PenLine className="size-4" />
                    Draft Reply
                  </div>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {message.draft.subject}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-6">
                    {message.draft.body}
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => insertDraft(message.draft!)}
                    >
                      Insert
                    </Button>
                    <Button
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => insertDraft(message.draft!)}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              )}
              {message.approval && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  <div className="mb-2 flex items-center gap-2 font-medium">
                    <AlertTriangle className="size-4" />
                    {message.approval.title}
                  </div>
                  <p className="text-xs leading-5">
                    {message.approval.description}
                  </p>
                  {handledApprovalIds.includes(message.approval.id) ? (
                    <p className="mt-3 rounded-md bg-white/70 px-2 py-1.5 text-xs font-medium">
                      Approval handled. This card cannot be reused.
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() =>
                          approveAction(message.approval!, message.draft)
                        }
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() => cancelAction(message.approval!)}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </article>
        ))}
        {isRunning && (
          <article className="flex justify-start">
            <div className="max-w-[88%] rounded-md border border-border/70 bg-card/95 p-3 text-sm shadow-sm">
              <div className="flex items-center gap-2">
                <span className="size-2 animate-pulse rounded-full bg-primary" />
                <span className="font-medium">BrokMail is working</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Reading live Gmail and calendar context through Pi. No sample
                mail is used.
              </p>
            </div>
          </article>
        )}
        <div ref={messageEndRef} />
      </div>

      <div className="border-t p-3 sm:p-4">
        <form
          className="flex items-end gap-2"
          onSubmit={event => {
            event.preventDefault()
            runAgent(agentInput)
          }}
        >
          <Textarea
            value={agentInput}
            onChange={event => setAgentInput(event.target.value)}
            placeholder="Ask your inbox anything..."
            className="max-h-32 min-h-10 resize-none"
          />
          <Button
            type="submit"
            size="icon"
            disabled={isRunning || !agentInput.trim()}
          >
            <Send className="size-4" />
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </div>
    </div>
  )
}

function CalendarEventList({
  events,
  selectedEventId,
  isSyncing,
  onSelect
}: {
  events: BrokCalendarEvent[]
  selectedEventId: string | null
  isSyncing: boolean
  onSelect: (eventId: string) => void
}) {
  if (events.length === 0) {
    return (
      <div className="space-y-2 p-4 text-sm text-muted-foreground">
        <p>No upcoming calendar events yet.</p>
        {isSyncing && <p>Syncing events...</p>}
      </div>
    )
  }

  return (
    <div className="space-y-2 p-2">
      {events.map(event => (
        <button
          key={event.id}
          className={cn(
            'dashboard-card block w-full p-3 text-left transition-colors hover:bg-muted/70',
            selectedEventId === event.id && 'dashboard-list-row-active'
          )}
          onClick={() => onSelect(event.id)}
        >
          <p className="truncate text-sm font-medium">{event.summary}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatCalendarTimestamp(event.startAt, event.isAllDay)}
          </p>
          {event.location && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {event.location}
            </p>
          )}
        </button>
      ))}
    </div>
  )
}

function CalendarWorkspace({
  events,
  selectedEvent,
  connectionMode,
  connectionStatus,
  connected,
  isSyncing,
  isConnecting,
  connectCalendar,
  runAgent
}: {
  events: BrokCalendarEvent[]
  selectedEvent: BrokCalendarEvent | null
  connectionMode: IntegrationConnectionMode
  connectionStatus: string
  connected: boolean
  isSyncing: boolean
  isConnecting: boolean
  connectCalendar: () => Promise<void>
  runAgent: (prompt: string) => void
}) {
  return (
    <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="border-b px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" />
              <span>Brok Calendar</span>
              <Badge variant={connected ? 'default' : 'outline'}>
                {modeLabel(connectionMode)}
              </Badge>
              {isSyncing && <span>Syncing...</span>}
            </div>
            <h1 className="mt-1 truncate text-lg font-semibold sm:text-xl">
              Google Calendar
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {connectionStatus}
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-2 sm:flex-none"
              onClick={connectCalendar}
              disabled={isConnecting}
            >
              <UserRoundCheck className="size-4" />
              {isConnecting ? 'Connecting...' : 'Connect Calendar'}
            </Button>
            <Button
              size="sm"
              className="flex-1 gap-2 sm:flex-none"
              onClick={() => runAgent('Show my next calendar events.')}
            >
              <Sparkles className="size-4" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() =>
              runAgent(
                'Add a calendar event tomorrow at 3pm called Team Standup for 30 minutes.'
              )
            }
          >
            Add Event
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() =>
              runAgent(
                `Remove the calendar event id ${selectedEvent?.id || ''}`.trim()
              )
            }
            disabled={!selectedEvent}
          >
            Remove Selected
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
        <div className="mx-auto max-w-3xl space-y-3">
          <div className="dashboard-card p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium">
              <CalendarDays className="size-3.5" />
              Upcoming Events
            </div>
            <p className="text-sm text-muted-foreground">
              {events.length > 0
                ? `${events.length} event(s) loaded from your primary calendar.`
                : 'No upcoming events found yet.'}
            </p>
          </div>

          {selectedEvent ? (
            <section className="dashboard-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{selectedEvent.summary}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatCalendarTimestamp(
                      selectedEvent.startAt,
                      selectedEvent.isAllDay
                    )}
                    {selectedEvent.endAt
                      ? ` - ${formatCalendarTimestamp(selectedEvent.endAt, selectedEvent.isAllDay)}`
                      : ''}
                  </p>
                </div>
                <Badge variant="secondary">Selected</Badge>
              </div>
              {selectedEvent.location && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Location: {selectedEvent.location}
                </p>
              )}
              {selectedEvent.description && (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {selectedEvent.description}
                </p>
              )}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() =>
                    runAgent(`Remove the calendar event id ${selectedEvent.id}`)
                  }
                >
                  <Trash2 className="size-4" />
                  Remove Event
                </Button>
                {selectedEvent.htmlLink && (
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={selectedEvent.htmlLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in Google Calendar
                    </a>
                  </Button>
                )}
              </div>
            </section>
          ) : (
            <section className="dashboard-card p-4 text-sm text-muted-foreground">
              Select an event from the list to inspect or remove it.
            </section>
          )}
        </div>
      </div>
    </main>
  )
}

function EmptyMailWorkspace({
  connected,
  connectionStatus,
  connectGmail,
  syncGmail,
  canSyncGmail,
  isConnecting,
  isSyncingMail,
  runAgent
}: {
  connected: boolean
  connectionStatus: string
  connectGmail: () => Promise<void>
  syncGmail: () => Promise<void>
  canSyncGmail: boolean
  isConnecting: boolean
  isSyncingMail: boolean
  runAgent: (prompt: string) => void
}) {
  return (
    <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <section className="dashboard-card w-full max-w-xl p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Mail className="size-4" />
            Live Gmail Required
          </div>
          <h2 className="text-xl font-semibold tracking-tight">
            Connect Gmail to load your real inbox.
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            BrokMail will not show sample mail. After connection, this workspace
            loads live Gmail threads in this browser, then prepares summaries,
            drafts, and approval-safe actions.
          </p>
          <div className="mt-4 rounded-lg border border-border/70 bg-background/70 p-3 text-xs text-muted-foreground">
            {isSyncingMail ? 'Syncing Gmail...' : connectionStatus}
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              className="gap-2"
              onClick={connectGmail}
              disabled={isConnecting}
            >
              <UserRoundCheck className="size-4" />
              {isConnecting
                ? 'Connecting...'
                : connected
                  ? 'Reconnect Gmail'
                  : 'Connect Gmail'}
            </Button>
            {canSyncGmail && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  void syncGmail()
                }}
                disabled={isConnecting}
              >
                <MailCheck className="size-4" />
                Load Live Inbox
              </Button>
            )}
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => runAgent('What needs my attention today?')}
            >
              <Sparkles className="size-4" />
              Try Inbox Brief
            </Button>
          </div>
        </section>
      </div>
    </main>
  )
}

function AutomationList({ rules }: { rules: AutomationRule[] }) {
  if (rules.length === 0) {
    return (
      <div className="p-6 text-sm leading-6 text-muted-foreground">
        No automations yet. Ask BrokMail to create one, then approve it before
        it is saved.
      </div>
    )
  }

  return (
    <div className="space-y-3 p-3">
      {rules.map(rule => (
        <article key={rule.id} className="dashboard-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{rule.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {rule.trigger}
              </p>
            </div>
            <Badge variant={rule.enabled ? 'default' : 'secondary'}>
              {rule.enabled ? 'On' : 'Off'}
            </Badge>
          </div>
          <Separator className="my-3" />
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>If: {rule.condition}</p>
            <p>Then: {rule.action}</p>
            <p>Approval: {rule.approval}</p>
            <p>Last run: {rule.lastRun}</p>
          </div>
        </article>
      ))}
    </div>
  )
}

function DraftList({
  messages,
  onInsert
}: {
  messages: AgentMessage[]
  onInsert: (draft: DraftState) => void
}) {
  const drafts = messages.flatMap(message =>
    message.draft ? [message.draft] : []
  )

  if (drafts.length === 0) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No AI drafts yet. Ask BrokMail to draft a reply.
      </div>
    )
  }

  return (
    <div className="space-y-3 p-3">
      {drafts.map(draft => (
        <article
          key={`${draft.threadId}-${draft.subject}`}
          className="dashboard-card p-3"
        >
          <p className="text-sm font-medium">{draft.subject}</p>
          <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs text-muted-foreground">
            {draft.body}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => onInsert(draft)}
          >
            Insert
          </Button>
        </article>
      ))}
    </div>
  )
}
