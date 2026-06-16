'use client'

import { useState, useTransition } from 'react'

import {
  Ban,
  Check,
  CheckCircle2,
  Clipboard,
  Clock3,
  KeyRound,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Trash2
} from 'lucide-react'

import {
  pauseApiKey,
  resumeApiKey,
  revokeApiKey,
  rotateApiKey
} from '@/lib/actions/api-keys'
import { API_KEY_LIMITS } from '@/lib/brok/api-platform'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'

const AVAILABLE_MODELS = [
  'brok-fast',
  'brok-lite',
  'brok-search',
  'brok-search-pro',
  'brok-code',
  'brok-agent',
  'brok-reasoning'
]

const AVAILABLE_SCOPES = [
  'chat:write',
  'search:write',
  'code:write',
  'agents:write',
  'usage:read',
  'logs:read'
]

interface ApiKeyRotationSummary {
  id: string
  name: string
  keyPrefix: string
  maskedKey: string
  status: ApiKey['status']
  createdAt: Date
  revokedAt: Date | null
}

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
  rotatedFromKeyId: string | null
  rotatedToKeyId: string | null
  rotatedAt: Date | null
  rotatedFromKey: ApiKeyRotationSummary | null
  rotatedToKey: ApiKeyRotationSummary | null
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

function getRotationDetail(key: ApiKey) {
  if (key.rotatedToKey) {
    return `Rotated to ${key.rotatedToKey.name}`
  }
  if (key.rotatedFromKey) {
    return `Replaces ${key.rotatedFromKey.name}`
  }
  return null
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
                    {getRotationDetail(key) ? (
                      <p className="text-xs text-muted-foreground">
                        {getRotationDetail(key)}
                      </p>
                    ) : null}
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

            {getRotationDetail(key) ? (
              <p className="text-sm text-muted-foreground">
                {getRotationDetail(key)}
              </p>
            ) : null}

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
        <RotationDialog keyRecord={keyRecord} disabled={disabled} />
      ) : null}
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

function RotationDialog({
  keyRecord,
  disabled
}: {
  keyRecord: ApiKey
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(`${keyRecord.name} replacement`)
  const [selectedScopes, setSelectedScopes] = useState<string[]>(
    keyRecord.scopes
  )
  const [selectedModels, setSelectedModels] = useState<string[]>(
    keyRecord.allowedModels
  )
  const [rpmLimit, setRpmLimit] = useState(keyRecord.rpmLimit ?? 60)
  const [dailyLimit, setDailyLimit] = useState(
    keyRecord.dailyRequestLimit ?? 5000
  )
  const [monthlyBudgetDollars, setMonthlyBudgetDollars] = useState(
    (keyRecord.monthlyBudgetCents ?? 0) / 100
  )
  const [createdKey, setCreatedKey] = useState<any>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRotate() {
    if (!name.trim()) return
    if (selectedScopes.length === 0) {
      setError('Select at least one scope for the replacement key.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await rotateApiKey(keyRecord.id, {
        name: name.trim(),
        scopes: selectedScopes,
        allowedModels: selectedModels,
        rpmLimit,
        dailyRequestLimit: dailyLimit,
        monthlyBudgetCents: Math.round(monthlyBudgetDollars * 100)
      })
      setCreatedKey(result)
    } catch (error) {
      console.error('Failed to rotate API key:', error)
      setError(
        error instanceof Error ? error.message : 'Could not rotate the API key.'
      )
    } finally {
      setLoading(false)
    }
  }

  function toggleScope(scope: string) {
    setSelectedScopes(prev =>
      prev.includes(scope)
        ? prev.filter(item => item !== scope)
        : [...prev, scope]
    )
  }

  function toggleModel(model: string) {
    setSelectedModels(prev =>
      prev.includes(model)
        ? prev.filter(item => item !== model)
        : [...prev, model]
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || Boolean(keyRecord.rotatedToKeyId)}
          className="gap-2"
        >
          <RefreshCw className="size-3.5" />
          Rotate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        {createdKey ? (
          <>
            <DialogHeader>
              <DialogTitle>Replacement key created</DialogTitle>
              <DialogDescription>
                Copy it now. Brok will not show this secret again.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border bg-emerald-50 p-3 text-sm text-emerald-950 dark:bg-emerald-950/20 dark:text-emerald-100">
                The original key is still active. Move traffic to the
                replacement, verify requests, then revoke the original key.
              </div>
              <div>
                <Label>New API key</Label>
                <div className="mt-2 grid gap-2 rounded-xl border bg-muted/35 p-3 sm:grid-cols-[1fr_auto]">
                  <code className="min-w-0 break-all rounded-lg bg-background px-3 py-2 font-mono text-sm">
                    {createdKey.key}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={async () => {
                      await navigator.clipboard.writeText(createdKey.key)
                      setCopied(true)
                    }}
                  >
                    {copied ? (
                      <CheckCircle2 className="size-4" />
                    ) : (
                      <Clipboard className="size-4" />
                    )}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Rotate {keyRecord.name}</DialogTitle>
              <DialogDescription>
                Start with inherited access and limits, then adjust the
                replacement before generating it.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-5">
              <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                <div>
                  <Label htmlFor={`rotate-name-${keyRecord.id}`}>
                    Replacement name
                  </Label>
                  <Input
                    id={`rotate-name-${keyRecord.id}`}
                    value={name}
                    onChange={event => setName(event.target.value)}
                    maxLength={API_KEY_LIMITS.nameMaxLength}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Environment</Label>
                  <div className="mt-2 flex h-10 items-center rounded-md border bg-muted/35 px-3 text-sm">
                    {keyRecord.environment}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Label>Scopes</Label>
                  <Badge variant="outline">{selectedScopes.length}</Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {AVAILABLE_SCOPES.map(scope => {
                    const checked = selectedScopes.includes(scope)
                    return (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => toggleScope(scope)}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                          checked
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-muted/45'
                        }`}
                        aria-pressed={checked}
                      >
                        <span
                          className={`flex size-5 shrink-0 items-center justify-center rounded border ${
                            checked
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'bg-background'
                          }`}
                        >
                          {checked ? <Check className="size-3.5" /> : null}
                        </span>
                        {scope}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Label>Models</Label>
                  <Badge variant="outline">
                    {selectedModels.length || 'all'}
                  </Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {AVAILABLE_MODELS.map(model => {
                    const checked = selectedModels.includes(model)
                    return (
                      <button
                        key={model}
                        type="button"
                        onClick={() => toggleModel(model)}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                          checked
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-muted/45'
                        }`}
                        aria-pressed={checked}
                      >
                        <span
                          className={`flex size-5 shrink-0 items-center justify-center rounded border ${
                            checked
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'bg-background'
                          }`}
                        >
                          {checked ? <Check className="size-3.5" /> : null}
                        </span>
                        {model}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor={`rotate-rpm-${keyRecord.id}`}>RPM</Label>
                  <Input
                    id={`rotate-rpm-${keyRecord.id}`}
                    type="number"
                    value={rpmLimit}
                    onChange={event => setRpmLimit(Number(event.target.value))}
                    min={API_KEY_LIMITS.rpmMin}
                    max={API_KEY_LIMITS.rpmMax}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor={`rotate-daily-${keyRecord.id}`}>Daily</Label>
                  <Input
                    id={`rotate-daily-${keyRecord.id}`}
                    type="number"
                    value={dailyLimit}
                    onChange={event =>
                      setDailyLimit(Number(event.target.value))
                    }
                    min={API_KEY_LIMITS.dailyMin}
                    max={API_KEY_LIMITS.dailyMax}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor={`rotate-budget-${keyRecord.id}`}>
                    Monthly budget
                  </Label>
                  <Input
                    id={`rotate-budget-${keyRecord.id}`}
                    type="number"
                    value={monthlyBudgetDollars}
                    onChange={event =>
                      setMonthlyBudgetDollars(Number(event.target.value))
                    }
                    min={API_KEY_LIMITS.monthlyBudgetMinCents / 100}
                    max={API_KEY_LIMITS.monthlyBudgetMaxCents / 100}
                    className="mt-2"
                  />
                </div>
              </div>

              {error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                onClick={handleRotate}
                disabled={
                  loading || !name.trim() || selectedScopes.length === 0
                }
                className="gap-2"
              >
                <RefreshCw className="size-4" />
                {loading ? 'Rotating...' : 'Generate replacement'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
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
