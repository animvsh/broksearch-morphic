'use client'

import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle
} from '@/components/ui/drawer'
import { Separator } from '@/components/ui/separator'

export interface AdminLogEvent {
  id: string
  requestId: string
  eventType: string
  time: Date | string
  userId: string
  workspace: string
  resource: string
  status: string
  model: string | null
  provider: string | null
  costUsd: number
  latencyMs: number
  errorCode: string | null
  errorMessage: string | null
  metadata: Record<string, unknown> | null
  redactedRequest: unknown
  redactedResponse: unknown
}

interface LogEventDrawerProps {
  event: AdminLogEvent | null
  open: boolean
  onClose: () => void
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value > 10 ? 2 : 4,
    maximumFractionDigits: value > 10 ? 2 : 4
  }).format(value)
}

function formatDateTime(value: Date | string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(value))
}

function formatJson(value: unknown) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function buildTimeline(event: AdminLogEvent) {
  const timeline: Array<{ label: string; at: string }> = [
    { label: 'Event received', at: formatDateTime(event.time) }
  ]
  const started = (event.metadata?.startedAt as string | undefined) ?? null
  const completed = (event.metadata?.completedAt as string | undefined) ?? null
  if (started) timeline.push({ label: 'Started', at: formatDateTime(started) })
  if (completed) {
    timeline.push({ label: 'Completed', at: formatDateTime(completed) })
  }
  if (event.latencyMs) {
    timeline.push({
      label: 'Total latency',
      at: `${event.latencyMs.toLocaleString()}ms`
    })
  }
  return timeline
}

export function LogEventDrawer({ event, open, onClose }: LogEventDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={next => !next && onClose()}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle>
            {event ? event.eventType : 'Log event detail'}
          </DrawerTitle>
          <DrawerDescription>
            Full request and response payload with redaction applied.
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {!event ? (
            <p className="text-sm text-muted-foreground">No event selected.</p>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Time" value={formatDateTime(event.time)} />
                <Field label="Request ID" value={event.requestId} mono />
                <Field label="Event type" value={event.eventType} />
                <Field label="Status" value={event.status} />
                <Field label="User" value={event.userId} />
                <Field label="Workspace" value={event.workspace} />
                <Field label="Resource" value={event.resource} mono />
                <Field label="Provider route" value={event.model ?? '—'} />
                <Field label="Provider" value={event.provider ?? '—'} />
                <Field label="Cost" value={formatCurrency(event.costUsd)} />
                <Field
                  label="Latency"
                  value={`${event.latencyMs.toLocaleString()}ms`}
                />
                <Field
                  label="Error"
                  value={event.errorCode ?? event.errorMessage ?? '—'}
                />
              </div>

              <Separator />

              <Section title="Redacted request JSON">
                <p className="mb-2 text-xs text-muted-foreground">
                  Sensitive keys (apiKey, authorization, cookies, secrets,
                  tokens) are masked with <code>***REDACTED***</code>.
                </p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs">
                  {formatJson(event.redactedRequest)}
                </pre>
              </Section>

              <Section title="Redacted response JSON">
                <p className="mb-2 text-xs text-muted-foreground">
                  Bearer/Basic auth headers and provider secrets are scrubbed
                  before display.
                </p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs">
                  {formatJson(event.redactedResponse)}
                </pre>
              </Section>

              <Section title="Timeline">
                <ul className="space-y-2 text-xs">
                  {buildTimeline(event).map((entry, index) => (
                    <li
                      key={index}
                      className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2"
                    >
                      <span className="font-medium">{entry.label}</span>
                      <span className="font-mono text-muted-foreground">
                        {entry.at}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>

              <Section title="Metadata">
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs">
                  {formatJson(event.metadata)}
                </pre>
              </Section>
            </div>
          )}
        </div>

        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function Field({
  label,
  value,
  mono = false
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 text-sm ${mono ? 'font-mono text-xs' : ''} break-words`}
      >
        {value}
      </p>
    </div>
  )
}

function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  )
}
