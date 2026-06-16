import Link from 'next/link'

import {
  getPresentationGenerationsForAdmin,
  refundPresentationGeneration
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
  if (status === 'completed') return 'default' as const
  if (status === 'failed') return 'destructive' as const
  return 'outline' as const
}

export default async function AdminPresentationGenerationsPage({
  searchParams
}: {
  searchParams: Promise<{ presentationId?: string }>
}) {
  const { presentationId } = await searchParams
  const generations = await getPresentationGenerationsForAdmin(presentationId)

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Presentation Generations</h1>
        <p className="text-muted-foreground">
          Every outline / slide / generation log across all decks.
        </p>
        {presentationId ? (
          <p className="text-xs text-muted-foreground">
            Filtered by presentationId: {presentationId} ·{' '}
            <Link
              href="/admin/presentations/generations"
              className="text-primary hover:underline"
            >
              clear
            </Link>
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Deck</th>
              <th className="px-3 py-2 text-left font-medium">Workspace</th>
              <th className="px-3 py-2 text-left font-medium">Type</th>
              <th className="px-3 py-2 text-left font-medium">Model</th>
              <th className="px-3 py-2 text-left font-medium">Prompt</th>
              <th className="px-3 py-2 text-right font-medium">In</th>
              <th className="px-3 py-2 text-right font-medium">Out</th>
              <th className="px-3 py-2 text-right font-medium">Cost</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Created</th>
              <th className="px-3 py-2 text-left font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {generations.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No generations recorded.
                </td>
              </tr>
            ) : (
              generations.map(gen => (
                <tr key={gen.id} className="border-b align-top last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/presentations/decks/${gen.presentationId}`}
                      className="font-medium hover:underline"
                    >
                      {gen.presentationTitle}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{gen.workspaceName}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{gen.generationType}</Badge>
                  </td>
                  <td className="px-3 py-2">{gen.model}</td>
                  <td className="max-w-md truncate px-3 py-2">{gen.prompt}</td>
                  <td className="px-3 py-2 text-right">{gen.inputTokens}</td>
                  <td className="px-3 py-2 text-right">{gen.outputTokens}</td>
                  <td className="px-3 py-2 text-right">
                    ${(gen.costCents / 100).toFixed(4)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={statusVariant(gen.status)}>
                      {gen.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDateTime(gen.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    <form action={refundPresentationGeneration}>
                      <input type="hidden" name="id" value={gen.id} />
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        className="h-7"
                      >
                        Refund
                      </Button>
                    </form>
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
