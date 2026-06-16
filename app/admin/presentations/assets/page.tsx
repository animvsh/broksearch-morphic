import Link from 'next/link'

import { getPresentationAssetsForAdmin } from '@/lib/actions/admin-presentations'

import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

export default async function AdminPresentationAssetsPage({
  searchParams
}: {
  searchParams: Promise<{ presentationId?: string }>
}) {
  const { presentationId } = await searchParams
  const assets = await getPresentationAssetsForAdmin(presentationId)

  const aiImageCount = assets.filter(a => a.assetType === 'ai_image').length
  const stockCount = assets.filter(a => a.assetType === 'stock_image').length
  const uploadedCount = assets.filter(a => a.assetType === 'upload').length

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/presentations"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Presentations Admin
        </Link>
        <h1 className="text-3xl font-bold">Assets</h1>
        <p className="text-muted-foreground">
          AI images, stock images, uploaded images, charts, and media embeds
          across all decks.
        </p>
        {presentationId ? (
          <p className="text-xs text-muted-foreground">
            Filtered by presentationId: {presentationId} ·{' '}
            <Link
              href="/admin/presentations/assets"
              className="text-primary hover:underline"
            >
              clear
            </Link>
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-muted-foreground">Total</p>
          <p className="mt-1 text-2xl font-bold">{assets.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-muted-foreground">
            AI generated
          </p>
          <p className="mt-1 text-2xl font-bold">{aiImageCount}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-muted-foreground">Stock</p>
          <p className="mt-1 text-2xl font-bold">{stockCount}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-muted-foreground">Uploaded</p>
          <p className="mt-1 text-2xl font-bold">{uploadedCount}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[1024px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Deck</th>
              <th className="px-3 py-2 text-left font-medium">Workspace</th>
              <th className="px-3 py-2 text-left font-medium">Type</th>
              <th className="px-3 py-2 text-left font-medium">Provider</th>
              <th className="px-3 py-2 text-left font-medium">URL</th>
              <th className="px-3 py-2 text-left font-medium">Prompt</th>
              <th className="px-3 py-2 text-left font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {assets.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No assets recorded.
                </td>
              </tr>
            ) : (
              assets.map(asset => (
                <tr key={asset.id} className="border-b align-top last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/presentations/decks/${asset.presentationId}`}
                      className="font-medium hover:underline"
                    >
                      {asset.presentationTitle}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{asset.workspaceName}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{asset.assetType}</Badge>
                  </td>
                  <td className="px-3 py-2">{asset.provider}</td>
                  <td className="px-3 py-2">
                    {asset.url ? (
                      <a
                        href={asset.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        open
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="max-w-md truncate px-3 py-2">
                    {asset.prompt ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDateTime(asset.createdAt)}
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
