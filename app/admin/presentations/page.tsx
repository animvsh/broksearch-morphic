import Link from 'next/link'

import {
  getAllDecksForAdmin,
  getPresentationCostsForAdmin,
  getPresentationExportsForAdmin,
  getPresentationGenerationsForAdmin,
  getPresentationSharesForAdmin
} from '@/lib/actions/admin-presentations'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

const SUBPAGE_LINKS = [
  { href: '/admin/presentations/decks', label: 'Decks' },
  { href: '/admin/presentations/generations', label: 'Generations' },
  { href: '/admin/presentations/slides', label: 'Slides' },
  { href: '/admin/presentations/themes', label: 'Themes' },
  { href: '/admin/presentations/assets', label: 'Assets' },
  { href: '/admin/presentations/exports', label: 'Exports' },
  { href: '/admin/presentations/shares', label: 'Share Links' },
  { href: '/admin/presentations/costs', label: 'Costs' }
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

export default async function AdminPresentationsPage() {
  const [decks, generations, exportsList, shares, costs] = await Promise.all([
    getAllDecksForAdmin(),
    getPresentationGenerationsForAdmin(),
    getPresentationExportsForAdmin(),
    getPresentationSharesForAdmin(),
    getPresentationCostsForAdmin()
  ])

  const totalCost = costs.reduce((sum, c) => sum + c.costCents, 0)
  const totalTokens = costs.reduce((sum, c) => sum + c.totalTokens, 0)
  const totalGenerations = generations.length
  const totalShares = shares.length
  const activeDecks = decks.filter(d => d.status !== 'deleted').length

  return (
    <div className="space-y-8 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Presentations Admin</h1>
          <p className="text-muted-foreground">
            All Gamma-style AI presentations generated in Brok. Monitor
            outlines, slides, themes, assets, exports, shares, and costs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {SUBPAGE_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active decks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeDecks}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {decks.length} total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Generations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalGenerations.toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              All-time generations
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tokens used
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalTokens.toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {totalShares} share links · {exportsList.length} exports
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalCost)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Across all decks
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent decks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Deck</th>
                  <th className="px-3 py-2 text-left font-medium">Workspace</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Slides</th>
                  <th className="px-3 py-2 text-right font-medium">Cost</th>
                  <th className="px-3 py-2 text-left font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {decks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-6 text-center text-muted-foreground"
                    >
                      No decks yet
                    </td>
                  </tr>
                ) : (
                  decks.slice(0, 10).map(deck => (
                    <tr key={deck.id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">
                        <Link
                          href={`/admin/presentations/decks/${deck.id}`}
                          className="hover:underline"
                        >
                          {deck.title}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{deck.workspaceName}</td>
                      <td className="px-3 py-2">
                        <Badge variant={statusVariant(deck.status)}>
                          {deck.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {deck.slideCount}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatCurrency(deck.costCents)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDateTime(deck.updatedAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
