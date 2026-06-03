import {
  getSystemHealth,
  ServiceHealth,
  ServiceStatus
} from '@/lib/actions/admin-health'
import { requirePageAuth } from '@/lib/auth/require-page-auth'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

const STATUS_STYLES: Record<
  ServiceStatus,
  { label: string; className: string }
> = {
  healthy: {
    label: 'healthy',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200'
  },
  degraded: {
    label: 'degraded',
    className: 'bg-amber-100 text-amber-800 border-amber-200'
  },
  down: {
    label: 'down',
    className: 'bg-red-100 text-red-800 border-red-200'
  },
  unknown: {
    label: 'unknown',
    className: 'bg-zinc-100 text-zinc-700 border-zinc-200'
  }
}

const OVERALL_STYLES: Record<ServiceStatus, string> = {
  healthy: 'bg-emerald-500/15 text-emerald-700 border-emerald-200',
  degraded: 'bg-amber-500/15 text-amber-700 border-amber-200',
  down: 'bg-red-500/15 text-red-700 border-red-200',
  unknown: 'bg-zinc-500/10 text-zinc-700 border-zinc-200'
}

function formatPercent(value: number | null) {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(1)}%`
}

function formatLatency(value: number | null) {
  if (value === null || value === undefined) return '—'
  return `${value}ms`
}

function formatTimestamp(value: Date | null) {
  if (!value) return 'never'
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

function groupServices(services: ServiceHealth[]) {
  const groups: Record<string, ServiceHealth[]> = {
    'API & Runtime': [],
    'Storage & Workers': [],
    'Identity & Billing': []
  }

  for (const service of services) {
    if (
      [
        'api-gateway',
        'database',
        'redis',
        'queue-workers',
        'app-build-runtime'
      ].includes(service.id)
    ) {
      groups['API & Runtime'].push(service)
    } else if (['presentation-export', 'storage'].includes(service.id)) {
      groups['Storage & Workers'].push(service)
    } else if (['auth', 'billing-webhooks'].includes(service.id)) {
      groups['Identity & Billing'].push(service)
    } else {
      groups['API & Runtime'].push(service)
    }
  }

  return groups
}

function ServiceRow({ service }: { service: ServiceHealth }) {
  const status = STATUS_STYLES[service.status]
  return (
    <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">{service.name}</p>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${status.className}`}
          >
            {status.label}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {service.description}
        </p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Uptime / Latency
        </p>
        <p className="text-sm font-medium">
          {formatPercent(service.uptimePercent)}
        </p>
        <p className="text-xs text-muted-foreground">
          Latency {formatLatency(service.latencyMs)}
        </p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Error Rate
        </p>
        <p className="text-sm font-medium">
          {formatPercent(service.errorRatePercent)}
        </p>
        <p className="text-xs text-muted-foreground">
          Last checked {formatTimestamp(service.lastCheckedAt)}
        </p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Last Error
        </p>
        <p className="text-sm font-medium text-muted-foreground">
          {service.lastError ?? 'None recorded'}
        </p>
      </div>
    </div>
  )
}

export default async function AdminHealthPage() {
  await requirePageAuth('/admin/health')

  const { services, overallStatus, generatedAt } = await getSystemHealth()
  const groups = groupServices(services)

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">System Health</h1>
          <p className="text-muted-foreground">
            Live status for every Brok backend dependency. Refreshed{' '}
            {formatTimestamp(generatedAt)}.
          </p>
        </div>
        <Badge
          className={`w-fit border ${OVERALL_STYLES[overallStatus]}`}
          variant="outline"
        >
          Overall: {overallStatus}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {Object.entries(groups).map(([title, items]) =>
          items.length === 0 ? null : (
            <Card key={title}>
              <CardHeader>
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {items.map(service => (
                  <ServiceRow key={service.id} service={service} />
                ))}
              </CardContent>
            </Card>
          )
        )}
      </div>
    </div>
  )
}
