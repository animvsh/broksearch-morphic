import type {
  LogEventType,
  LogFilters
} from '@/lib/actions/admin-search-projects-logs-data'
import {
  getGlobalLogFacets,
  getGlobalLogsForAdmin
} from '@/lib/actions/admin-search-projects-logs-data'
import { requirePageAuth } from '@/lib/auth/require-page-auth'

import { GlobalLogsClient } from './global-logs-client'

export const dynamic = 'force-dynamic'

interface LogsPageProps {
  searchParams: Promise<{
    dateFrom?: string
    dateTo?: string
    eventType?: string
    userId?: string
    workspaceId?: string
    model?: string
    provider?: string
    status?: string
    hasError?: string
    requestId?: string
  }>
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function parseBoolean(value?: string): boolean | undefined {
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return undefined
}

export default async function GlobalLogsPage({ searchParams }: LogsPageProps) {
  await requirePageAuth('/admin/logs')
  const params = await searchParams

  const filters: LogFilters = {
    dateFrom: parseDate(params.dateFrom),
    dateTo: parseDate(params.dateTo),
    eventType:
      (params.eventType as LogEventType | 'all' | undefined) || undefined,
    userId: params.userId || undefined,
    workspaceId: params.workspaceId || undefined,
    model: params.model || undefined,
    provider: params.provider || undefined,
    status: (params.status as LogFilters['status']) || undefined,
    hasError: parseBoolean(params.hasError),
    requestId: params.requestId || undefined
  }

  const [logs, facets] = await Promise.all([
    getGlobalLogsForAdmin(filters),
    getGlobalLogFacets()
  ])

  return (
    <GlobalLogsClient
      rows={logs}
      facets={facets}
      initialFilters={{
        dateFrom: params.dateFrom ?? '',
        dateTo: params.dateTo ?? '',
        eventType: params.eventType ?? 'all',
        userId: params.userId ?? '',
        workspaceId: params.workspaceId ?? '',
        model: params.model ?? '',
        provider: params.provider ?? '',
        status: params.status ?? 'all',
        hasError: params.hasError ?? 'all',
        requestId: params.requestId ?? ''
      }}
    />
  )
}
