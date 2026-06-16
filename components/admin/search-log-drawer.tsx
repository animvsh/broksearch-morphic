'use client'

import { useEffect, useState, useTransition } from 'react'

import {
  blockSourceDomain,
  boostSourceDomain,
  debugCitationQuality,
  markBadAnswer,
  refundSearchUsage,
  replayQuery
} from '@/lib/actions/admin-search-projects-logs'
import type { SearchLogDetail } from '@/lib/actions/admin-search-projects-logs-data'

import { Badge } from '@/components/ui/badge'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'

interface SearchLogDrawerProps {
  logId: string | null
  onClose: () => void
}

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value > 10 ? 2 : 4,
    maximumFractionDigits: value > 10 ? 2 : 4
  }).format(value)
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(value))
}

export function SearchLogDrawer({ logId, onClose }: SearchLogDrawerProps) {
  const [detail, setDetail] = useState<SearchLogDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [domain, setDomain] = useState('')

  useEffect(() => {
    if (!logId) {
      setDetail(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/admin/search-logs/${logId}`, { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) {
          const body = await response.json().catch(() => null)
          throw new Error(body?.error ?? `Failed to load log ${logId}`)
        }
        return response.json()
      })
      .then((data: SearchLogDetail) => {
        if (!cancelled) setDetail(data)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [logId])

  const isOpen = logId !== null

  function runAdminAction(formData: FormData) {
    startTransition(() => {
      const action = String(formData.get('__action') ?? '')
      if (action === 'refund') {
        refundSearchUsage(formData)
      } else if (action === 'mark-bad') {
        markBadAnswer(formData)
      } else if (action === 'replay') {
        replayQuery(formData)
      } else if (action === 'debug-citations') {
        debugCitationQuality(formData)
      } else if (action === 'block-domain') {
        blockSourceDomain(formData)
      } else if (action === 'boost-domain') {
        boostSourceDomain(formData)
      }
    })
  }

  return (
    <Drawer open={isOpen} onOpenChange={open => !open && onClose()}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle>Search log detail</DrawerTitle>
          <DrawerDescription>
            Inspect query, sources, citations, and admin actions.
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : !detail ? (
            <p className="text-sm text-muted-foreground">No log selected.</p>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Time" value={formatDateTime(detail.createdAt)} />
                <Field label="Request ID" value={detail.requestId} mono />
                <Field label="User" value={detail.userId} />
                <Field label="Workspace" value={detail.workspaceName} />
                <Field
                  label="Model"
                  value={`${detail.model} (${detail.provider})`}
                />
                <Field label="Status" value={detail.status} />
                <Field label="Latency" value={`${detail.latencyMs}ms`} />
                <Field label="Cost" value={formatCurrency(detail.costUsd)} />
                <Field
                  label="Tokens (in/out)"
                  value={`${detail.inputTokens ?? 0} / ${detail.outputTokens ?? 0}`}
                />
                <Field label="Citations" value={String(detail.citations)} />
                <Field label="Sources" value={String(detail.sourceCount)} />
                <Field label="Error" value={detail.errorCode ?? '—'} />
              </div>

              <Separator />

              <Section title="Original query">
                <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs">
                  {detail.query ?? '—'}
                </pre>
              </Section>

              <Section title="Resolved query">
                <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs">
                  {(detail.metadata?.resolvedQuery as string) ??
                    (detail.metadata?.rewrittenQuery as string) ??
                    detail.query ??
                    '—'}
                </pre>
              </Section>

              <Section title="Generated search queries">
                <GeneratedQueries metadata={detail.metadata ?? {}} />
              </Section>

              <Section title="Sources">
                <SourcesView metadata={detail.metadata ?? {}} />
              </Section>

              <Section title="Final answer">
                <FinalAnswer metadata={detail.metadata ?? {}} />
              </Section>

              <Section title="Citations">
                <CitationsView metadata={detail.metadata ?? {}} />
              </Section>

              <Section title="Follow-up suggestions">
                <FollowupsView metadata={detail.metadata ?? {}} />
              </Section>

              <Section title="Model route">
                <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs">
                  {formatJson({
                    model: detail.model,
                    provider: detail.provider,
                    surface: detail.surface,
                    endpoint: detail.endpoint
                  })}
                </pre>
              </Section>

              <Section title="Token usage">
                <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs">
                  {formatJson({
                    inputTokens: detail.inputTokens,
                    outputTokens: detail.outputTokens,
                    costUsd: detail.costUsd
                  })}
                </pre>
              </Section>

              <Section title="Cost">
                <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs">
                  {formatJson({ costUsd: detail.costUsd })}
                </pre>
              </Section>

              <Section title="Latency">
                <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs">
                  {formatJson({ latencyMs: detail.latencyMs })}
                </pre>
              </Section>

              <Section title="Errors">
                <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs">
                  {formatJson(
                    detail.errorCode
                      ? { errorCode: detail.errorCode }
                      : (detail.metadata?.error ?? null)
                  )}
                </pre>
              </Section>

              <Section title="Redacted request payload">
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs">
                  {formatJson(detail.redactedRequest)}
                </pre>
              </Section>

              <Section title="Redacted response payload">
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs">
                  {formatJson(detail.redactedResponse)}
                </pre>
              </Section>

              <Separator />

              <Section title="Admin actions">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <form action={runAdminAction} className="space-y-2">
                    <input type="hidden" name="__action" value="replay" />
                    <input type="hidden" name="id" value={detail.id} />
                    <Label>Replay query</Label>
                    <p className="text-xs text-muted-foreground">
                      Re-run the original query and compare the new answer.
                    </p>
                    <Button type="submit" variant="outline" disabled={pending}>
                      Replay
                    </Button>
                  </form>
                  <form action={runAdminAction} className="space-y-2">
                    <input
                      type="hidden"
                      name="__action"
                      value="debug-citations"
                    />
                    <input type="hidden" name="id" value={detail.id} />
                    <Label>Debug citation quality</Label>
                    <p className="text-xs text-muted-foreground">
                      Capture a citation score for the source list.
                    </p>
                    <Button type="submit" variant="outline" disabled={pending}>
                      Run debug
                    </Button>
                  </form>
                  <form action={runAdminAction} className="space-y-2">
                    <input type="hidden" name="__action" value="mark-bad" />
                    <input type="hidden" name="id" value={detail.id} />
                    <Label>Mark as bad answer</Label>
                    <p className="text-xs text-muted-foreground">
                      Flag the response for QA review and dataset tuning.
                    </p>
                    <Button type="submit" variant="outline" disabled={pending}>
                      Mark bad
                    </Button>
                  </form>
                  <form action={runAdminAction} className="space-y-2">
                    <input type="hidden" name="__action" value="refund" />
                    <input type="hidden" name="id" value={detail.id} />
                    <Label>Refund usage</Label>
                    <p className="text-xs text-muted-foreground">
                      Queue a billing refund for this request.
                    </p>
                    <Button type="submit" variant="outline" disabled={pending}>
                      Refund
                    </Button>
                  </form>
                  <form
                    action={runAdminAction}
                    className="space-y-2 sm:col-span-2"
                  >
                    <input type="hidden" name="__action" value="block-domain" />
                    <Label htmlFor="block-domain">Block source domain</Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="block-domain"
                        name="domain"
                        value={domain}
                        onChange={event => setDomain(event.target.value)}
                        placeholder="example.com"
                      />
                      <Button
                        type="submit"
                        variant="destructive"
                        disabled={pending || !domain}
                      >
                        Block
                      </Button>
                    </div>
                  </form>
                  <form
                    action={runAdminAction}
                    className="space-y-2 sm:col-span-2"
                  >
                    <input type="hidden" name="__action" value="boost-domain" />
                    <Label htmlFor="boost-domain">Boost source domain</Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="boost-domain"
                        name="domain"
                        value={domain}
                        onChange={event => setDomain(event.target.value)}
                        placeholder="example.com"
                      />
                      <Button type="submit" disabled={pending || !domain}>
                        Boost
                      </Button>
                    </div>
                  </form>
                </div>
                <Textarea
                  readOnly
                  className="mt-3 hidden"
                  value=""
                  aria-hidden
                />
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

function GeneratedQueries({ metadata }: { metadata: Record<string, unknown> }) {
  const generated = Array.isArray(metadata.generatedQueries)
    ? (metadata.generatedQueries as string[])
    : []
  if (generated.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No generated queries.</p>
    )
  }
  return (
    <ul className="list-inside list-disc space-y-1 text-xs">
      {generated.map((q, index) => (
        <li key={index}>{q}</li>
      ))}
    </ul>
  )
}

function SourcesView({ metadata }: { metadata: Record<string, unknown> }) {
  const sources = Array.isArray(metadata.sources)
    ? (metadata.sources as Array<Record<string, unknown>>)
    : []
  const found = Array.isArray(metadata.sourcesFound)
    ? (metadata.sourcesFound as Array<Record<string, unknown>>)
    : []
  const selected = Array.isArray(metadata.sourcesSelected)
    ? (metadata.sourcesSelected as Array<Record<string, unknown>>)
    : []
  const rejected = Array.isArray(metadata.sourcesRejected)
    ? (metadata.sourcesRejected as Array<Record<string, unknown>>)
    : []
  return (
    <div className="space-y-2 text-xs">
      <p>
        Found: <Badge variant="outline">{found.length || sources.length}</Badge>{' '}
        Selected:{' '}
        <Badge variant="outline">
          {selected.length ||
            (Array.isArray(metadata.citations)
              ? (metadata.citations as unknown[]).length
              : 0)}
        </Badge>{' '}
        Rejected: <Badge variant="outline">{rejected.length}</Badge>
      </p>
      {sources.length > 0 ? (
        <ul className="list-inside list-disc space-y-1">
          {sources.slice(0, 25).map((source, index) => (
            <li key={index}>
              {(source.title as string) ?? (source.url as string) ?? 'Source'}
              {typeof source.url === 'string' ? (
                <>
                  {' '}
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline"
                  >
                    {truncate(source.url, 60)}
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">No source list captured.</p>
      )}
    </div>
  )
}

function FinalAnswer({ metadata }: { metadata: Record<string, unknown> }) {
  const answer =
    (metadata.finalAnswer as string) ??
    (metadata.answer as string) ??
    (metadata.responseText as string) ??
    null
  if (!answer) {
    return <p className="text-xs text-muted-foreground">No answer captured.</p>
  }
  return (
    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs">
      {answer}
    </pre>
  )
}

function CitationsView({ metadata }: { metadata: Record<string, unknown> }) {
  const citations = Array.isArray(metadata.citations)
    ? (metadata.citations as Array<Record<string, unknown>>)
    : []
  if (citations.length === 0) {
    return <p className="text-xs text-muted-foreground">No citations.</p>
  }
  return (
    <ul className="list-inside list-disc space-y-1 text-xs">
      {citations.map((citation, index) => (
        <li key={index}>
          {(citation.title as string) ?? (citation.url as string) ?? 'Citation'}
        </li>
      ))}
    </ul>
  )
}

function FollowupsView({ metadata }: { metadata: Record<string, unknown> }) {
  const followups = Array.isArray(metadata.followups)
    ? (metadata.followups as string[])
    : []
  if (followups.length === 0) {
    return <p className="text-xs text-muted-foreground">No follow-ups.</p>
  }
  return (
    <ul className="list-inside list-disc space-y-1 text-xs">
      {followups.map((followup, index) => (
        <li key={index}>{followup}</li>
      ))}
    </ul>
  )
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value
  return `${value.slice(0, max)}…`
}
