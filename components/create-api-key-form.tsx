'use client'

import { useState } from 'react'

import {
  Check,
  CheckCircle2,
  Clipboard,
  Code2,
  Gauge,
  KeyRound,
  Search,
  Server,
  Sparkles,
  Terminal,
  WalletCards
} from 'lucide-react'

import { CreateApiKeyInput } from '@/lib/actions/api-keys'
import { API_KEY_LIMITS } from '@/lib/brok/api-platform'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

interface CreateApiKeyFormProps {
  action: (
    userId: string,
    workspaceId: string,
    input: CreateApiKeyInput
  ) => Promise<any>
  userId: string
  workspaceId: string
}

const AVAILABLE_MODELS = [
  { id: 'brok-fast', name: 'Brok Fast', detail: 'Default fast model' },
  { id: 'brok-lite', name: 'Brok Lite', detail: 'Fast chat and summaries' },
  { id: 'brok-search', name: 'Brok Search', detail: 'Grounded web answers' },
  {
    id: 'brok-search-pro',
    name: 'Brok Search Pro',
    detail: 'Deeper research mode'
  },
  { id: 'brok-code', name: 'Brok Code', detail: 'Builder and code runtime' },
  { id: 'brok-agent', name: 'Brok Agent', detail: 'Tool and task execution' },
  {
    id: 'brok-reasoning',
    name: 'Brok Reasoning',
    detail: 'Longer reasoning tasks'
  }
]

const AVAILABLE_SCOPES = [
  {
    id: 'chat:write',
    name: 'Chat',
    detail: 'Create chat and message completions',
    icon: Sparkles
  },
  {
    id: 'search:write',
    name: 'Search',
    detail: 'Use web-grounded search completions',
    icon: Search
  },
  {
    id: 'code:write',
    name: 'BrokCode',
    detail: 'Run builder and code execution calls',
    icon: Code2
  },
  {
    id: 'agents:write',
    name: 'Agents',
    detail: 'Run tool and task workflows',
    icon: Terminal
  },
  {
    id: 'usage:read',
    name: 'Usage',
    detail: 'Read metering and ledger summaries',
    icon: Gauge
  },
  {
    id: 'logs:read',
    name: 'Logs',
    detail: 'Read request and debug logs',
    icon: Server
  }
]

export function CreateApiKeyForm({
  action,
  userId,
  workspaceId
}: CreateApiKeyFormProps) {
  const [name, setName] = useState('')
  const [environment, setEnvironment] = useState<'test' | 'live'>('test')
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['chat:write'])
  const [rpmLimit, setRpmLimit] = useState(60)
  const [dailyLimit, setDailyLimit] = useState(5000)
  const [monthlyBudgetDollars, setMonthlyBudgetDollars] = useState(0)
  const [createdKey, setCreatedKey] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    if (selectedScopes.length === 0) {
      setError('Select at least one scope for this key.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await action(userId, workspaceId, {
        name: name.trim(),
        environment,
        scopes: selectedScopes,
        allowedModels: selectedModels,
        rpmLimit,
        dailyRequestLimit: dailyLimit,
        monthlyBudgetCents: Math.round(monthlyBudgetDollars * 100)
      })
      setCreatedKey(result)
    } catch (error) {
      console.error('Failed to create key:', error)
      setError(
        error instanceof Error ? error.message : 'Could not create the API key.'
      )
    } finally {
      setLoading(false)
    }
  }

  function toggleModel(modelId: string) {
    setSelectedModels(prev =>
      prev.includes(modelId)
        ? prev.filter(m => m !== modelId)
        : [...prev, modelId]
    )
  }

  function toggleScope(scopeId: string) {
    setSelectedScopes(prev =>
      prev.includes(scopeId)
        ? prev.filter(s => s !== scopeId)
        : [...prev, scopeId]
    )
  }

  if (createdKey) {
    return (
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="border-b bg-emerald-50 p-5 text-emerald-950 dark:bg-emerald-950/20 dark:text-emerald-100">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
              <Check className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">API key created</h2>
              <p className="mt-1 text-sm opacity-80">
                Copy it now. This is the only time Brok will show the secret.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <div>
            <Label>Your API key</Label>
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

          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <SummaryItem label="Name" value={createdKey.name} />
            <SummaryItem label="Environment" value={createdKey.environment} />
            <SummaryItem
              label="Rate limit"
              value={`${createdKey.rpmLimit} RPM`}
            />
            <SummaryItem
              label="Budget"
              value={formatBudget(createdKey.monthlyBudgetCents)}
            />
          </div>
        </div>
      </div>
    )
  }

  const canSubmit = name.trim().length > 0 && selectedScopes.length > 0

  return (
    <form
      onSubmit={handleSubmit}
      className="overflow-hidden rounded-xl border bg-background shadow-sm"
    >
      <div className="border-b p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Key details</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Name the key for the app or workflow that will own it.
            </p>
          </div>
          <Badge
            variant={environment === 'live' ? 'default' : 'secondary'}
            className="w-fit"
          >
            {environment}
          </Badge>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_220px]">
          <div>
            <Label htmlFor="name">Key name</Label>
            <Input
              id="name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Production app"
              required
              className="mt-2 h-11"
            />
          </div>

          <div>
            <Label htmlFor="environment">Environment</Label>
            <Select
              value={environment}
              onValueChange={v => setEnvironment(v as 'test' | 'live')}
            >
              <SelectTrigger id="environment" className="mt-2 h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="test">Test</SelectItem>
                <SelectItem value="live">Live</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[1fr_360px]">
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h3 className="font-semibold">Scopes</h3>
              <p className="text-sm text-muted-foreground">
                Choose what this key can do.
              </p>
            </div>
            <Badge variant="outline">{selectedScopes.length} selected</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {AVAILABLE_SCOPES.map(scope => {
              const checked = selectedScopes.includes(scope.id)
              const Icon = scope.icon
              return (
                <button
                  key={scope.id}
                  type="button"
                  onClick={() => toggleScope(scope.id)}
                  className={`group flex min-h-[96px] items-start gap-3 rounded-xl border p-3 text-left transition ${
                    checked
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'bg-background hover:bg-muted/45'
                  }`}
                  aria-pressed={checked}
                >
                  <span
                    className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border ${
                      checked
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'bg-muted/40 text-muted-foreground'
                    }`}
                  >
                    {checked ? (
                      <Check className="size-4" />
                    ) : (
                      <Icon className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{scope.name}</span>
                    <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                      {scope.detail}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="space-y-5">
          <div>
            <h3 className="font-semibold">Model access</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Leave empty to allow every enabled Brok model.
            </p>
            <div className="mt-3 space-y-2">
              {AVAILABLE_MODELS.map(model => {
                const checked = selectedModels.includes(model.id)
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => toggleModel(model.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${
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
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {model.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {model.detail}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border bg-muted/25 p-4">
            <h3 className="flex items-center gap-2 font-semibold">
              <WalletCards className="size-4" />
              Limits
            </h3>
            <div className="mt-4 grid gap-4">
              <div>
                <Label htmlFor="rpm">Requests per minute</Label>
                <Input
                  id="rpm"
                  type="number"
                  value={rpmLimit}
                  onChange={e => setRpmLimit(Number(e.target.value))}
                  min={API_KEY_LIMITS.rpmMin}
                  max={API_KEY_LIMITS.rpmMax}
                  className="mt-2 h-11"
                />
              </div>
              <div>
                <Label htmlFor="daily">Daily request limit</Label>
                <Input
                  id="daily"
                  type="number"
                  value={dailyLimit}
                  onChange={e => setDailyLimit(Number(e.target.value))}
                  min={API_KEY_LIMITS.dailyMin}
                  max={API_KEY_LIMITS.dailyMax}
                  className="mt-2 h-11"
                />
              </div>
              <div>
                <Label htmlFor="budget">Monthly budget</Label>
                <div className="relative mt-2">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="budget"
                    type="number"
                    value={monthlyBudgetDollars}
                    onChange={e =>
                      setMonthlyBudgetDollars(Number(e.target.value))
                    }
                    min={API_KEY_LIMITS.monthlyBudgetMinCents / 100}
                    max={API_KEY_LIMITS.monthlyBudgetMaxCents / 100}
                    step={1}
                    className="h-11 pl-7"
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Set 0 for unlimited spend on this key.
                </p>
              </div>
              <div>
                <Label htmlFor="budget-preview">Stored budget</Label>
                <Input
                  id="budget-preview"
                  value={formatBudget(Math.round(monthlyBudgetDollars * 100))}
                  readOnly
                  className="mt-2 h-11"
                />
              </div>
            </div>
          </div>
        </section>
      </div>

      {error ? (
        <div className="mx-5 mb-5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive sm:mx-6">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t bg-muted/20 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <p className="text-sm text-muted-foreground">
          This key will be tied to your current Brok workspace.
        </p>
        <Button
          type="submit"
          disabled={loading || !canSubmit}
          className="gap-2"
        >
          <KeyRound className="size-4" />
          {loading ? 'Creating...' : 'Create key'}
        </Button>
      </div>
    </form>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/25 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate font-medium">{value}</p>
    </div>
  )
}

function formatBudget(cents: number | null) {
  if (!cents) return 'Unlimited'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(cents / 100)
}
