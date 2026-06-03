import Link from 'next/link'

import {
  deletePresentationDeck,
  getAllDecksForAdmin,
  setPresentationPublicShare,
  setPresentationStatus
} from '@/lib/actions/admin-presentations'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

const STATUSES = [
  'outline_generating',
  'outline_ready',
  'slides_generating',
  'editing',
  'ready',
  'exporting',
  'exported',
  'failed',
  'shared',
  'deleted'
] as const

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value > 10 ? 2 : 4,
    maximumFractionDigits: value > 10 ? 2 : 4
  }).format(value / 100)
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

function statusVariant(status: string) {
  if (status === 'ready' || status === 'exported' || status === 'shared')
    return 'default' as const
  if (status === 'failed') return 'destructive' as const
  if (status === 'deleted') return 'secondary' as const
  return 'outline' as const
}

export default async function AdminDecksPage() {
  const decks = await getAllDecksForAdmin()

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Decks</h1>
        <p className="text-muted-foreground">
          Every Gamma-style AI presentation generated in Brok.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[1280px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Presentation</th>
              <th className="px-3 py-2 text-left font-medium">Owner</th>
              <th className="px-3 py-2 text-left font-medium">Workspace</th>
              <th className="px-3 py-2 text-right font-medium">Slides</th>
              <th className="px-3 py-2 text-left font-medium">Theme</th>
              <th className="px-3 py-2 text-left font-medium">Style</th>
              <th className="px-3 py-2 text-left font-medium">Language</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Visibility</th>
              <th className="px-3 py-2 text-right font-medium">Exports</th>
              <th className="px-3 py-2 text-right font-medium">Cost</th>
              <th className="px-3 py-2 text-left font-medium">Created</th>
              <th className="px-3 py-2 text-left font-medium">Edited</th>
              <th className="px-3 py-2 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {decks.length === 0 ? (
              <tr>
                <td
                  colSpan={14}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No decks yet
                </td>
              </tr>
            ) : (
              decks.map(deck => (
                <tr key={deck.id} className="border-b align-top last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/presentations/decks/${deck.id}`}
                      className="font-medium hover:underline"
                    >
                      {deck.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <p className="max-w-36 truncate font-mono text-xs">
                      {deck.ownerId}
                    </p>
                  </td>
                  <td className="px-3 py-2">{deck.workspaceName}</td>
                  <td className="px-3 py-2 text-right">{deck.slideCount}</td>
                  <td className="px-3 py-2">
                    {deck.themeId ? (
                      <Badge variant="outline">{deck.themeId}</Badge>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2">{deck.style ?? '—'}</td>
                  <td className="px-3 py-2">{deck.language}</td>
                  <td className="px-3 py-2">
                    <Badge variant={statusVariant(deck.status)}>
                      {deck.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={deck.isPublic ? 'default' : 'outline'}>
                      {deck.isPublic ? 'Public' : 'Private'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">{deck.exportCount}</td>
                  <td className="px-3 py-2 text-right">
                    {formatCurrency(deck.costCents)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDateTime(deck.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDateTime(deck.updatedAt)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex min-w-[260px] flex-wrap gap-1.5">
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-7"
                      >
                        <Link href={`/admin/presentations/decks/${deck.id}`}>
                          Open
                        </Link>
                      </Button>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-7"
                      >
                        <Link
                          href={`/admin/presentations/slides?presentationId=${deck.id}`}
                        >
                          Slides
                        </Link>
                      </Button>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-7"
                      >
                        <Link
                          href={`/admin/presentations/exports?presentationId=${deck.id}`}
                        >
                          Exports
                        </Link>
                      </Button>
                      {deck.isPublic ? (
                        <form action={setPresentationPublicShare}>
                          <input type="hidden" name="id" value={deck.id} />
                          <input type="hidden" name="enabled" value="false" />
                          <Button
                            type="submit"
                            size="sm"
                            variant="outline"
                            className="h-7"
                          >
                            Disable share
                          </Button>
                        </form>
                      ) : null}
                      <form action={deletePresentationDeck}>
                        <input type="hidden" name="id" value={deck.id} />
                        <Button
                          type="submit"
                          size="sm"
                          variant="destructive"
                          className="h-7"
                        >
                          Delete
                        </Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-muted-foreground">
        Available statuses: {STATUSES.join(', ')}
      </div>
    </div>
  )
}
