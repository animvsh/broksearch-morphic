import Link from 'next/link'

import {
  getPresentationSharesForAdmin,
  revokePresentationShare
} from '@/lib/actions/admin-presentations'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

function statusVariant(status: string) {
  if (status === 'active') return 'default' as const
  if (status === 'revoked') return 'destructive' as const
  if (status === 'expired') return 'secondary' as const
  return 'outline' as const
}

export default async function AdminPresentationSharesPage({
  searchParams
}: {
  searchParams: Promise<{ presentationId?: string }>
}) {
  const { presentationId } = await searchParams
  const shares = await getPresentationSharesForAdmin(presentationId)

  const activeShares = shares.filter(s => s.status === 'active').length
  const totalViews = shares.reduce((sum, s) => sum + s.viewCount, 0)

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/presentations"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Presentations Admin
        </Link>
        <h1 className="text-3xl font-bold">Share Links</h1>
        <p className="text-muted-foreground">
          Share link management for every deck — visibility, views, and
          revocation.
        </p>
        {presentationId ? (
          <p className="text-xs text-muted-foreground">
            Filtered by presentationId: {presentationId} ·{' '}
            <Link
              href="/admin/presentations/shares"
              className="text-primary hover:underline"
            >
              clear
            </Link>
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-muted-foreground">
            Total links
          </p>
          <p className="mt-1 text-2xl font-bold">{shares.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-muted-foreground">
            Active links
          </p>
          <p className="mt-1 text-2xl font-bold">{activeShares}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-muted-foreground">
            Total views
          </p>
          <p className="mt-1 text-2xl font-bold">
            {totalViews.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Deck</th>
              <th className="px-3 py-2 text-left font-medium">Workspace</th>
              <th className="px-3 py-2 text-left font-medium">Share ID</th>
              <th className="px-3 py-2 text-left font-medium">Visibility</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Views</th>
              <th className="px-3 py-2 text-left font-medium">Last viewed</th>
              <th className="px-3 py-2 text-left font-medium">Created</th>
              <th className="px-3 py-2 text-left font-medium">Expires</th>
              <th className="px-3 py-2 text-left font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {shares.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No share links recorded.
                </td>
              </tr>
            ) : (
              shares.map(share => (
                <tr key={share.id} className="border-b align-top last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/presentations/decks/${share.presentationId}`}
                      className="font-medium hover:underline"
                    >
                      {share.presentationTitle}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{share.workspaceName}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {share.shareId}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={share.isPublic ? 'default' : 'outline'}>
                      {share.isPublic ? 'Public' : 'Private'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={statusVariant(share.status)}>
                      {share.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">{share.viewCount}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {share.lastViewedAt
                      ? formatDateTime(share.lastViewedAt)
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDateTime(share.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {share.expiresAt ? formatDateTime(share.expiresAt) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {share.status === 'active' ? (
                      <form action={revokePresentationShare}>
                        <input type="hidden" name="id" value={share.id} />
                        <Button
                          type="submit"
                          size="sm"
                          variant="outline"
                          className="h-7"
                        >
                          Disable
                        </Button>
                      </form>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
