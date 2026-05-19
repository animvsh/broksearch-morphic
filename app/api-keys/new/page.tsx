import Link from 'next/link'
import { redirect } from 'next/navigation'

import {
  ArrowLeft,
  KeyRound,
  LockKeyhole,
  Server,
  ShieldCheck
} from 'lucide-react'

import { createApiKey, ensureWorkspaceForUser } from '@/lib/actions/api-keys'
import { requireFeatureAccess } from '@/lib/auth/app-access'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { CreateApiKeyForm } from '@/components/create-api-key-form'

export const dynamic = 'force-dynamic'

export default async function NewApiKeyPage() {
  const user = await requireFeatureAccess('/api-keys/new', 'api_platform')
  if (!user) {
    redirect(`/auth/login?redirectTo=${encodeURIComponent('/api-keys/new')}`)
  }

  const workspace = await ensureWorkspaceForUser(user.id)

  return (
    <div className="dashboard-shell min-h-svh px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-6 xl:grid-cols-[1fr_360px]">
        <main className="min-w-0 space-y-5">
          <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2">
            <Link href="/api-keys">
              <ArrowLeft className="size-4" />
              API keys
            </Link>
          </Button>

          <header className="rounded-xl border bg-background p-5 shadow-sm sm:p-6">
            <Badge variant="outline" className="mb-4 gap-2">
              <KeyRound className="size-3.5" />
              New credential
            </Badge>
            <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
              Create API key
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Pick the environment, endpoint scopes, model access, and limits
              for this key before it touches a real app.
            </p>
          </header>

          <CreateApiKeyForm
            action={createApiKey}
            userId={user.id}
            workspaceId={workspace.id}
          />
        </main>

        <aside className="space-y-3 xl:pt-[42px]">
          <SideNote
            icon={LockKeyhole}
            title="Secret appears once"
            text="Copy the generated key before leaving the success screen. Brok stores only the hash."
          />
          <SideNote
            icon={ShieldCheck}
            title="Least privilege"
            text="Start with chat or search only, then add BrokCode, agent, usage, or log scopes when an app needs them."
          />
          <SideNote
            icon={Server}
            title="Server side only"
            text="Live keys belong in backend environments, Railway variables, or a local CLI vault. Never ship them to a browser bundle."
          />
        </aside>
      </div>
    </div>
  )
}

function SideNote({
  icon: Icon,
  title,
  text
}: {
  icon: typeof KeyRound
  title: string
  text: string
}) {
  return (
    <div className="rounded-xl border bg-background p-5 shadow-sm">
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg border bg-muted/40">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  )
}
