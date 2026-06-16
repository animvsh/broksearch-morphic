'use client'

import { useTransition } from 'react'

import {
  Ban,
  Clock3,
  KeyRound,
  Pause,
  Play,
  ShieldCheck,
  Trash2
} from 'lucide-react'

import { pauseApiKey, resumeApiKey, revokeApiKey } from '@/lib/actions/api-keys'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'

interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  maskedKey: string
  environment: 'test' | 'live'
  status: 'active' | 'paused' | 'revoked'
  scopes: string[]
  allowedModels: string[]
  rpmLimit: number | null
  dailyRequestLimit: number | null
  monthlyBudgetCents: number | null
  lastUsedAt: Date | null
  expiresAt: Date | null
  createdAt: Date
  revokedAt: Date | null
}

function formatDate(value: Date | null) {
  if (!value) return 'Never used'
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function formatLimit(value: number | null, suffix: string) {
  if (!value) return 'Unlimited'
  if (!suffix) return value.toLocaleString()
  return `${value.toLocaleString()} ${suffix}`
}

function getLifecycleDetail(key: ApiKey) {
  if (key.status === 'revoked') {
    return key.revokedAt ? `Revoked ${formatDate(key.revokedAt)}` : 'Revoked'
  }

  if (isExpired(key)) {
    return key.expiresAt ? `Expired ${formatDate(key.expiresAt)}` : 'Expired'
  }

  if (key.status === 'paused') {
    return 'Paused until resumed'
  }

  return key.lastUsedAt ? `Used ${formatDate(key.lastUsedAt)}` : 'Never used'
}

function getExpiryDetail(key: ApiKey) {
  if (!key.expiresAt) return 'No expiration'
  return isExpired(key)
    ? `Expired ${formatDate(key.expiresAt)}`
    : `Expires ${formatDate(key.expiresAt)}`
}

function isExpired(key: ApiKey) {
  return Boolean(
    key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now()
  )
}

export function ApiKeyTable({ keys }: { keys: ApiKey[] }) {
  const [isPending, startTransition] = useTransition()

  if (keys.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 p-10 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl border bg-background shadow-sm">
          <KeyRound className="size-5 text-muted-foreground" />
        </div>
        <h3 className="mt-4 font-semibold">No API keys yet</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Create a scoped key for your first app, script, CLI session, or
          BrokCode runtime.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/35">
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Limits</TableHead>
              <TableHead>Lifecycle</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map(key => (
              <TableRow key={key.id}>
                <TableCell>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-medium">
                      {key.name}
                      <Badge
                        variant={
                          key.environment === 'live' ? 'default' : 'secondary'
                        }
                      >
                        {key.environment}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Created {formatDate(key.createdAt)}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
                    {key.maskedKey}
                  </code>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge status={key.status} expired={isExpired(key)} />
                    <Badge variant="outline" className="gap-1">
                      <ShieldCheck className="size-3" />
                      {key.scopes.length || 'all'} scopes
                    </Badge>
                    <Badge variant="outline">
                      {key.allowedModels.length || 'all'} models
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <p>{formatLimit(key.rpmLimit, 'RPM')}</p>
                  <p>{formatLimit(key.dailyRequestLimit, 'daily')}</p>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 className="size-3.5" />
                    {getLifecycleDetail(key)}
                  </span>
                  <p className="mt-1 text-xs">{getExpiryDetail(key)}</p>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <KeyActions
                      keyRecord={key}
                      disabled={isPending}
                      onAction={action =>
                        startTransition(() => {
                          void action(key.id)
                        })
                      }
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="divide-y lg:hidden">
        {keys.map(key => (
          <div key={key.id} className="space-y-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{key.name}</p>
                <code className="mt-1 block truncate font-mono text-xs text-muted-foreground">
                  {key.maskedKey}
                </code>
              </div>
              <StatusBadge status={key.status} expired={isExpired(key)} />
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <MobileFact label="Env" value={key.environment} />
              <MobileFact label="RPM" value={formatLimit(key.rpmLimit, '')} />
              <MobileFact
                label="Daily"
                value={formatLimit(key.dailyRequestLimit, '')}
              />
              <MobileFact label="Lifecycle" value={getLifecycleDetail(key)} />
              <MobileFact label="Expires" value={getExpiryDetail(key)} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {key.scopes.length || 'all'} scopes
              </Badge>
              <Badge variant="outline">
                {key.allowedModels.length || 'all'} models
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <KeyActions
                keyRecord={key}
                disabled={isPending}
                onAction={action =>
                  startTransition(() => {
                    void action(key.id)
                  })
                }
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusBadge({
  status,
  expired
}: {
  status: ApiKey['status']
  expired?: boolean
}) {
  if (expired && status !== 'revoked') {
    return (
      <Badge variant="destructive" className="gap-1">
        <Clock3 className="size-3" />
        expired
      </Badge>
    )
  }

  const icon =
    status === 'active' ? (
      <ShieldCheck className="size-3" />
    ) : status === 'paused' ? (
      <Pause className="size-3" />
    ) : (
      <Ban className="size-3" />
    )

  return (
    <Badge
      variant={
        status === 'active'
          ? 'default'
          : status === 'paused'
            ? 'secondary'
            : 'destructive'
      }
      className="gap-1"
    >
      {icon}
      {status}
    </Badge>
  )
}

function KeyActions({
  keyRecord,
  disabled,
  onAction
}: {
  keyRecord: ApiKey
  disabled: boolean
  onAction: (action: (keyId: string) => Promise<void>) => void
}) {
  return (
    <>
      {keyRecord.status === 'active' ? (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="gap-2"
          onClick={() => onAction(pauseApiKey)}
        >
          <Pause className="size-3.5" />
          Pause
        </Button>
      ) : keyRecord.status === 'paused' ? (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="gap-2"
          onClick={() => onAction(resumeApiKey)}
        >
          <Play className="size-3.5" />
          Resume
        </Button>
      ) : null}
      {keyRecord.status !== 'revoked' ? (
        <Button
          variant="destructive"
          size="sm"
          disabled={disabled}
          className="gap-2"
          onClick={() => onAction(revokeApiKey)}
        >
          <Trash2 className="size-3.5" />
          Revoke
        </Button>
      ) : null}
    </>
  )
}

function MobileFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/25 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate">{value}</p>
    </div>
  )
}
