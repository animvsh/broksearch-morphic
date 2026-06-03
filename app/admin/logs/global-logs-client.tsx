'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { REDACTED_PLACEHOLDER } from '@/lib/redaction'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

import { LogEventDrawer } from '@/components/admin/log-event-drawer'

type AdminLogRow = {
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

const ALL_VALUE = '__all__'

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

function selectValue(value: string | undefined) {
  return value && value.length > 0 ? value : ALL_VALUE
}

interface GlobalLogsClientProps {
  rows: AdminLogRow[]
  facets: {
    eventTypes: { id: string; label: string }[]
    workspaces: Array<{ id: string; name: string }>
    models: string[]
    providers: string[]
  }
  initialFilters: Record<string, string>
}

export function GlobalLogsClient({
  rows,
  facets,
  initialFilters
}: GlobalLogsClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null)

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== ALL_VALUE) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    const query = params.toString()
    router.replace(`/admin/logs${query ? `?${query}` : ''}`)
  }

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const params = new URLSearchParams()
    for (const [key, value] of formData.entries()) {
      const stringValue = String(value ?? '').trim()
      if (stringValue) params.set(key, stringValue)
    }
    router.replace(`/admin/logs${params.toString() ? `?${params}` : ''}`)
  }

  function resetFilters() {
    router.replace('/admin/logs')
  }

  const selected = rows.find(row => row.id === selectedLogId) ?? null

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-bold">Global Logs</h1>
        <p className="text-muted-foreground">
          Every event across the platform. Sensitive data is masked with{' '}
          <code className="rounded bg-muted px-1 text-xs">
            {REDACTED_PLACEHOLDER}
          </code>
          .
        </p>
      </div>

      <form
        onSubmit={applyFilters}
        className="grid grid-cols-1 gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Date from
          </label>
          <Input
            type="date"
            name="dateFrom"
            defaultValue={initialFilters.dateFrom}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Date to
          </label>
          <Input
            type="date"
            name="dateTo"
            defaultValue={initialFilters.dateTo}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Event type
          </label>
          <Select
            value={selectValue(initialFilters.eventType)}
            onValueChange={value => updateParam('eventType', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>All events</SelectItem>
              {facets.eventTypes.map(eventType => (
                <SelectItem key={eventType.id} value={eventType.id}>
                  {eventType.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Workspace
          </label>
          <Select
            value={selectValue(initialFilters.workspaceId)}
            onValueChange={value => updateParam('workspaceId', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All workspaces" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>All workspaces</SelectItem>
              {facets.workspaces.map(workspace => (
                <SelectItem key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            User ID
          </label>
          <Input
            name="userId"
            defaultValue={initialFilters.userId}
            placeholder="user_..."
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Request ID
          </label>
          <Input
            name="requestId"
            defaultValue={initialFilters.requestId}
            placeholder="req_..."
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Model
          </label>
          <Select
            value={selectValue(initialFilters.model)}
            onValueChange={value => updateParam('model', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All models" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>All models</SelectItem>
              {facets.models.map(model => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Provider
          </label>
          <Select
            value={selectValue(initialFilters.provider)}
            onValueChange={value => updateParam('provider', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All providers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>All providers</SelectItem>
              {facets.providers.map(provider => (
                <SelectItem key={provider} value={provider}>
                  {provider}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Status
          </label>
          <Select
            value={selectValue(initialFilters.status)}
            onValueChange={value => updateParam('status', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Any status</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Has error
          </label>
          <Select
            value={selectValue(initialFilters.hasError)}
            onValueChange={value => updateParam('hasError', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Either" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Either</SelectItem>
              <SelectItem value="true">Yes</SelectItem>
              <SelectItem value="false">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit">Apply filters</Button>
          <Button type="button" variant="outline" onClick={resetFilters}>
            Reset
          </Button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[1280px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Time</th>
              <th className="px-3 py-2 text-left font-medium">Event</th>
              <th className="px-3 py-2 text-left font-medium">User</th>
              <th className="px-3 py-2 text-left font-medium">Workspace</th>
              <th className="px-3 py-2 text-left font-medium">Resource</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Model</th>
              <th className="px-3 py-2 text-left font-medium">Provider</th>
              <th className="px-3 py-2 text-right font-medium">Cost</th>
              <th className="px-3 py-2 text-right font-medium">Latency</th>
              <th className="px-3 py-2 text-left font-medium">Error</th>
              <th className="px-3 py-2 text-left font-medium">Request ID</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={12}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No log events match the current filters.
                </td>
              </tr>
            ) : (
              rows.map(row => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b transition-colors hover:bg-muted/30 last:border-0"
                  onClick={() => setSelectedLogId(row.id)}
                >
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatDateTime(row.time)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <Badge variant="outline">{row.eventType}</Badge>
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-xs">
                    {row.userId}
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-xs">
                    {row.workspace}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-xs font-mono">
                    {row.resource}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={
                        row.status === 'success' ? 'default' : 'destructive'
                      }
                    >
                      {row.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs">{row.model ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{row.provider ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-xs">
                    {formatCurrency(row.costUsd)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {row.latencyMs}ms
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-xs text-destructive">
                    {row.errorCode ?? row.errorMessage ?? '—'}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px]">
                    {row.requestId.slice(0, 14)}…
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <LogEventDrawer
        event={selected}
        open={Boolean(selectedLogId)}
        onClose={() => setSelectedLogId(null)}
      />
    </div>
  )
}
