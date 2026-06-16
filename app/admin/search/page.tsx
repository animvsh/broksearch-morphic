import type { SearchLogFilters } from '@/lib/actions/admin-search-projects-logs-data'
import {
  getSearchLogFacets,
  getSearchLogsForAdmin
} from '@/lib/actions/admin-search-projects-logs-data'
import { requirePageAuth } from '@/lib/auth/require-page-auth'

import { SearchAdminClient } from './search-admin-client'

export const dynamic = 'force-dynamic'

interface SearchPageProps {
  searchParams: Promise<{
    dateFrom?: string
    dateTo?: string
    workspaceId?: string
    userId?: string
    model?: string
    provider?: string
    endpoint?: string
    status?: string
    hasError?: string
    minCost?: string
    minLatencyMs?: string
    query?: string
  }>
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function parseNumber(value?: string): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseBoolean(value?: string): boolean | undefined {
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return undefined
}

export default async function AdminSearchPage({
  searchParams
}: SearchPageProps) {
  await requirePageAuth('/admin/search')
  const params = await searchParams

  const filters: SearchLogFilters = {
    dateFrom: parseDate(params.dateFrom),
    dateTo: parseDate(params.dateTo),
    workspaceId: params.workspaceId || undefined,
    userId: params.userId || undefined,
    model: params.model || undefined,
    provider: params.provider || undefined,
    endpoint: (params.endpoint as SearchLogFilters['endpoint']) || undefined,
    status: (params.status as SearchLogFilters['status']) || undefined,
    hasError: parseBoolean(params.hasError),
    minCost: parseNumber(params.minCost),
    minLatencyMs: parseNumber(params.minLatencyMs),
    query: params.query || undefined
  }

  const [rows, facets] = await Promise.all([
    getSearchLogsForAdmin(filters),
    getSearchLogFacets()
  ])

  return (
    <SearchAdminClient
      rows={rows}
      facets={facets}
      initialFilters={{
        dateFrom: params.dateFrom ?? '',
        dateTo: params.dateTo ?? '',
        workspaceId: params.workspaceId ?? '',
        userId: params.userId ?? '',
        model: params.model ?? '',
        provider: params.provider ?? '',
        endpoint: params.endpoint ?? '',
        status: params.status ?? '',
        hasError: params.hasError ?? '',
        minCost: params.minCost ?? '',
        minLatencyMs: params.minLatencyMs ?? '',
        query: params.query ?? ''
      }}
    />
  )
}
