import Link from 'next/link'
import { redirect } from 'next/navigation'

import {
  Activity,
  ArrowRight,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Sparkles
} from 'lucide-react'

import { ensureWorkspaceForUser, listApiKeys } from '@/lib/actions/api-keys'
import { requireFeatureAccess } from '@/lib/auth/app-access'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { ApiKeyTable } from '@/components/api-key-table'

export const dynamic = 'force-dynamic'

export default async function ApiKeysPage() {
  const user = await requireFeatureAccess('/api-platform/keys', 'api_platform')
  if (!user) {
    redirect(
      `/auth/login?redirectTo=${encodeURIComponent('/api-platform/keys')}`
    )
  }

  const workspace = await ensureWorkspaceForUser(user.id)
  const keys = await listApiKeys(workspace.id)
  const activeKeys = keys.filter(key => key.status === 'active').length
  const liveKeys = keys.filter(key => key.environment === 'live').length
  const scopedKeys = keys.filter(key => key.scopes.length > 0).length

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
          <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Your API Keys</h2>
              <p className="text-sm text-muted-foreground">
                {keys.length === 0
                  ? 'Create your first key to unlock API and TUI access.'
                  : `${keys.length} key${keys.length === 1 ? '' : 's'} in ${workspace.name}.`}
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link href="/docs/api-keys">
                Docs
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <div className="p-3 sm:p-5">
            <ApiKeyTable keys={keys} />
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl border bg-background p-5 shadow-sm">
            <div className="mb-3 flex size-10 items-center justify-center rounded-lg border bg-muted/40">
              <KeyRound className="size-5" />
            </div>
            <h3 className="font-semibold">Key shown once</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Brok only reveals the secret when you create it. Store it in your
              server environment or CLI vault before leaving the page.
            </p>
          </div>
          <div className="rounded-xl border bg-background p-5 shadow-sm">
            <h3 className="font-semibold">Recommended setup</h3>
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <p>Use test keys for local scripts and playground trials.</p>
              <p>Use live keys only on trusted servers.</p>
              <p>Scope keys to the smallest set of endpoints they need.</p>
            </div>
          </div>
        </aside>
      </div>

      <div className="grid border-t bg-muted/25 pt-6 sm:grid-cols-3">
        <Metric
          icon={ShieldCheck}
          label="Active keys"
          value={activeKeys.toString()}
        />
        <Metric
          icon={LockKeyhole}
          label="Live keys"
          value={liveKeys.toString()}
        />
        <Metric
          icon={KeyRound}
          label="Scoped keys"
          value={scopedKeys.toString()}
        />
      </div>
    </div>
  )
}

function Metric({
  icon: Icon,
  label,
  value
}: {
  icon: typeof KeyRound
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background shadow-sm ring-1 ring-border">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-2xl font-semibold leading-none">{value}</p>
        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      </div>
    </div>
  )
}
