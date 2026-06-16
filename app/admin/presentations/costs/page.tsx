import Link from 'next/link'

import { getPresentationCostsForAdmin } from '@/lib/actions/admin-presentations'

import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

function formatCurrencyCents(cents: number) {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents > 1000 ? 2 : 4,
    maximumFractionDigits: cents > 1000 ? 2 : 4
  }).format(cents / 100)
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

export default async function AdminPresentationCostsPage() {
  const costs = await getPresentationCostsForAdmin()

  const totalCost = costs.reduce((sum, c) => sum + c.costCents, 0)
  const totalTokens = costs.reduce((sum, c) => sum + c.totalTokens, 0)
  const totalGenerations = costs.reduce((sum, c) => sum + c.generations, 0)

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/presentations"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Presentations Admin
        </Link>
        <h1 className="text-3xl font-bold">Presentation Costs</h1>
        <p className="text-muted-foreground">
          Cost telemetry per deck — outline, slide, image, and total generation
          spend.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-muted-foreground">
            Total generations
          </p>
          <p className="mt-1 text-2xl font-bold">
            {totalGenerations.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-muted-foreground">
            Total tokens
          </p>
          <p className="mt-1 text-2xl font-bold">
            {totalTokens.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-muted-foreground">
            Total cost
          </p>
          <p className="mt-1 text-2xl font-bold">
            {formatCurrencyCents(totalCost)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Deck</th>
              <th className="px-3 py-2 text-left font-medium">Workspace</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Generations</th>
              <th className="px-3 py-2 text-right font-medium">Tokens</th>
              <th className="px-3 py-2 text-right font-medium">Cost</th>
              <th className="px-3 py-2 text-left font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {costs.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No cost data.
                </td>
              </tr>
            ) : (
              costs.map(cost => (
                <tr
                  key={cost.presentationId}
                  className="border-b last:border-0"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/presentations/decks/${cost.presentationId}`}
                      className="font-medium hover:underline"
                    >
                      {cost.presentationTitle}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{cost.workspaceName}</td>
                  <td className="px-3 py-2">
                    <Badge variant={statusVariant(cost.status)}>
                      {cost.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">{cost.generations}</td>
                  <td className="px-3 py-2 text-right">
                    {cost.totalTokens.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatCurrencyCents(cost.costCents)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDateTime(cost.updatedAt)}
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
