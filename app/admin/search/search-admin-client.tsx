'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import type {
  SearchLogFacets,
  SearchLogFilters
} from '@/lib/actions/admin-search-projects-logs-data'

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

import { SearchLogDrawer } from '@/components/admin/search-log-drawer'

type AdminSearchRow = {
  id: string
  requestId: string
  createdAt: Date | string
  userId: string
  userEmail: string
  workspaceId: string
  workspaceName: string
  query: string | null
  searchMode: string
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  latencyMs: number
  status: string
  errorCode: string | null
  citationCount: number
  sourceCount: number
  metadata: Record<string, unknown> | null
}

interface SearchAdminClientProps {
  rows: AdminSearchRow[]
  facets: SearchLogFacets
  initialFilters: Record<string, string>
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
    minute: '2-digit'
  }).format(new Date(value))
}

function selectValue(value: string | undefined) {
  return value && value.length > 0 ? value : ALL_VALUE
}

export function SearchAdminClient({
  rows,
  facets,
  initialFilters
}: SearchAdminClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null)

  const query = searchParams.get('query') ?? initialFilters.query ?? ''

  const filters: SearchLogFilters = useMemo(
    () => ({
      dateFrom: initialFilters.dateFrom
        ? new Date(initialFilters.dateFrom)
        : undefined,
      dateTo: initialFilters.dateTo
        ? new Date(initialFilters.dateTo)
        : undefined,
      workspaceId: initialFilters.workspaceId || undefined,
      userId: initialFilters.userId || undefined,
      model: initialFilters.model || undefined,
      provider: initialFilters.provider || undefined,
      endpoint:
        (initialFilters.endpoint as SearchLogFilters['endpoint']) || undefined,
      status:
        (initialFilters.status as SearchLogFilters['status']) || undefined,
      hasError:
        initialFilters.hasError === 'true'
          ? true
          : initialFilters.hasError === 'false'
            ? false
            : undefined,
      minCost: initialFilters.minCost
        ? Number.parseFloat(initialFilters.minCost)
        : undefined,
      minLatencyMs: initialFilters.minLatencyMs
        ? Number.parseFloat(initialFilters.minLatencyMs)
        : undefined,
      query: query || undefined
    }),
    [initialFilters, query]
  )

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== ALL_VALUE) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    const queryString = params.toString()
    router.replace(`/admin/search${queryString ? `?${queryString}` : ''}`)
  }

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const params = new URLSearchParams()
    for (const [key, value] of formData.entries()) {
      const stringValue = String(value ?? '').trim()
      if (stringValue) params.set(key, stringValue)
    }
    router.replace(`/admin/search${params.toString() ? `?${params}` : ''}`)
  }

  function resetFilters() {
    router.replace('/admin/search')
  }

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-bold">Brok Search Admin</h1>
        <p className="text-muted-foreground">
          Inspect every search run, replay queries, and tune citations.
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
            Search mode
          </label>
          <Select
            value={selectValue(initialFilters.endpoint)}
            onValueChange={value => updateParam('endpoint', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Any mode</SelectItem>
              {facets.modes.map(mode => (
                <SelectItem key={mode} value={mode}>
                  {mode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            Cost &gt; (USD)
          </label>
          <Input
            type="number"
            step="0.0001"
            name="minCost"
            defaultValue={initialFilters.minCost}
            placeholder="0.05"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Latency &gt; (ms)
          </label>
          <Input
            type="number"
            name="minLatencyMs"
            defaultValue={initialFilters.minLatencyMs}
            placeholder="5000"
          />
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
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">
            Free text (query / source / session)
          </label>
          <Input
            name="query"
            defaultValue={query}
            placeholder="exact text or substring"
          />
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit">Apply filters</Button>
          <Button type="button" variant="outline" onClick={resetFilters}>
            Reset
          </Button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[1180px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Time</th>
              <th className="px-3 py-2 text-left font-medium">User</th>
              <th className="px-3 py-2 text-left font-medium">Query</th>
              <th className="px-3 py-2 text-left font-medium">Mode</th>
              <th className="px-3 py-2 text-left font-medium">Sources</th>
              <th className="px-3 py-2 text-left font-medium">Citations</th>
              <th className="px-3 py-2 text-left font-medium">Model</th>
              <th className="px-3 py-2 text-left font-medium">Provider</th>
              <th className="px-3 py-2 text-right font-medium">In</th>
              <th className="px-3 py-2 text-right font-medium">Out</th>
              <th className="px-3 py-2 text-right font-medium">Cost</th>
              <th className="px-3 py-2 text-right font-medium">Latency</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={13}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No search logs match the current filters.
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
                    {formatDateTime(row.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    <p className="max-w-[160px] truncate text-xs font-medium">
                      {row.userEmail}
                    </p>
                    <p className="max-w-[160px] truncate text-xs text-muted-foreground">
                      {row.workspaceName}
                    </p>
                  </td>
                  <td className="max-w-[260px] truncate px-3 py-2 text-xs">
                    {row.query || '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">{row.searchMode}</td>
                  <td className="px-3 py-2 text-xs">{row.sourceCount}</td>
                  <td className="px-3 py-2 text-xs">{row.citationCount}</td>
                  <td className="px-3 py-2 text-xs">{row.model}</td>
                  <td className="px-3 py-2 text-xs">{row.provider}</td>
                  <td className="px-3 py-2 text-right text-xs">
                    {row.inputTokens ?? 0}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {row.outputTokens ?? 0}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {formatCurrency(row.costUsd)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {row.latencyMs}ms
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={
                        row.status === 'success' ? 'default' : 'destructive'
                      }
                    >
                      {row.status}
                    </Badge>
                    {row.errorCode ? (
                      <p className="mt-1 max-w-[160px] truncate text-xs text-destructive">
                        {row.errorCode}
                      </p>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <SearchLogDrawer
        logId={selectedLogId}
        onClose={() => setSelectedLogId(null)}
      />
    </div>
  )
}
