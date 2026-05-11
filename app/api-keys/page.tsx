import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ensureWorkspaceForUser, listApiKeys } from '@/lib/actions/api-keys'
import { getRequiredBrokAccountUser } from '@/lib/brokcode/account-guard'

import { Button } from '@/components/ui/button'

import { ApiKeyTable } from '@/components/api-key-table'

export const dynamic = 'force-dynamic'

export default async function ApiKeysPage() {
  const user = await getRequiredBrokAccountUser()
  if (!user) {
    redirect(`/auth/login?redirectTo=${encodeURIComponent('/api-keys')}`)
  }

  const workspace = await ensureWorkspaceForUser(user.id)
  const keys = await listApiKeys(workspace.id)

  return (
    <div className="container py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Brok API Keys</h1>
          <p className="text-muted-foreground mt-1">
            Manage your API keys for accessing Brok
          </p>
        </div>
        <Button asChild>
          <Link href="/api-keys/new">Create New Key</Link>
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4">Your API Keys</h2>
          <ApiKeyTable keys={keys} />
        </div>
      </div>

      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-yellow-800">
          <strong>Important:</strong> Your API key is only shown once after
          creation. Copy it somewhere safe. You will not be able to see it
          again.
        </p>
      </div>
    </div>
  )
}
