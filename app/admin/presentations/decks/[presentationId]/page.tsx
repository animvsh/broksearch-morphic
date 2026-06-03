import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  getDeckForAdmin,
  getPresentationAssetsForAdmin,
  getPresentationExportsForAdmin,
  getPresentationGenerationsForAdmin,
  getPresentationOutlineForAdmin,
  getPresentationSharesForAdmin,
  getPresentationSlidesForAdmin
} from '@/lib/actions/admin-presentations'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'outline', label: 'Outline' },
  { id: 'slides', label: 'Slides' },
  { id: 'assets', label: 'Assets' },
  { id: 'speaker-notes', label: 'Speaker Notes' },
  { id: 'exports', label: 'Exports' },
  { id: 'shares', label: 'Share Links' },
  { id: 'generations', label: 'Generation Logs' },
  { id: 'costs', label: 'Costs' },
  { id: 'security', label: 'Security' }
] as const

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

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export default async function AdminDeckDetailPage({
  params
}: {
  params: Promise<{ presentationId: string }>
}) {
  const { presentationId } = await params
  const [deck, slides, assets, exportsList, generations, shares, outline] =
    await Promise.all([
      getDeckForAdmin(presentationId),
      getPresentationSlidesForAdmin(presentationId),
      getPresentationAssetsForAdmin(presentationId),
      getPresentationExportsForAdmin(presentationId),
      getPresentationGenerationsForAdmin(presentationId),
      getPresentationSharesForAdmin(presentationId),
      getPresentationOutlineForAdmin(presentationId)
    ])

  if (!deck) {
    notFound()
  }

  const totalCost = generations.reduce((sum, g) => sum + g.costCents, 0)

  return (
    <div className="space-y-6 px-4 pb-12 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            href="/admin/presentations/decks"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← All decks
          </Link>
          <h1 className="mt-2 text-3xl font-bold">{deck.title}</h1>
          <p className="text-muted-foreground">
            {deck.workspaceName} · {deck.slideCount} slides · {deck.language}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(deck.status)}>{deck.status}</Badge>
          <Badge variant={deck.isPublic ? 'default' : 'outline'}>
            {deck.isPublic ? 'Public' : 'Private'}
          </Badge>
          {deck.shareId ? (
            <code className="rounded-md border bg-muted/30 px-2 py-1 text-xs">
              {deck.shareId}
            </code>
          ) : null}
        </div>
      </div>

      <nav className="sticky top-0 z-10 -mx-4 flex flex-wrap gap-1 border-y bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {SECTIONS.map(section => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {section.label}
          </a>
        ))}
      </nav>

      <section id="overview" className="space-y-4">
        <h2 className="text-xl font-semibold">Overview</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Title
              </CardTitle>
            </CardHeader>
            <CardContent className="font-medium">{deck.title}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Owner
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-xs">{deck.ownerId}</p>
              <p className="text-xs text-muted-foreground">
                {deck.workspaceName}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Slide count
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {deck.slideCount}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Theme
              </CardTitle>
            </CardHeader>
            <CardContent>
              {deck.themeId ? (
                <Badge variant="outline">{deck.themeId}</Badge>
              ) : (
                '—'
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Style
              </CardTitle>
            </CardHeader>
            <CardContent>{deck.style ?? '—'}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Language
              </CardTitle>
            </CardHeader>
            <CardContent>{deck.language}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Web search
              </CardTitle>
            </CardHeader>
            <CardContent>
              {generations.some(g => g.webSearchEnabled) ? 'Enabled' : '—'}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Model used
              </CardTitle>
            </CardHeader>
            <CardContent>{deck.model ?? '—'}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total tokens
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {deck.totalTokens.toLocaleString()}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Image count
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {deck.imageCount}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Export count
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {deck.exportCount}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Share status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={deck.isPublic ? 'default' : 'outline'}>
                {deck.isPublic ? 'Public' : 'Private'}
              </Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total cost
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {(totalCost / 100).toLocaleString('en', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: totalCost > 1000 ? 2 : 4
              })}
            </CardContent>
          </Card>
        </div>
        {deck.description ? (
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">{deck.description}</p>
            </CardContent>
          </Card>
        ) : null}
      </section>

      <section id="outline" className="space-y-4">
        <h2 className="text-xl font-semibold">Outline</h2>
        <p className="text-sm text-muted-foreground">
          Editable / generated outline.
        </p>
        {outline ? (
          <Card>
            <CardHeader>
              <CardTitle>Status: {outline.status ?? 'unknown'}</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[480px] overflow-auto rounded-md border bg-muted/30 p-3 text-xs">
                {stringify(outline.outlineJson)}
              </pre>
            </CardContent>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">No outline recorded.</p>
        )}
      </section>

      <section id="slides" className="space-y-4">
        <h2 className="text-xl font-semibold">Slides</h2>
        {slides.length === 0 ? (
          <p className="text-sm text-muted-foreground">No slides yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {slides.map(slide => (
              <Card key={slide.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Slide {slide.slideIndex + 1}: {slide.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Layout: {slide.layoutType}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section id="assets" className="space-y-4">
        <h2 className="text-xl font-semibold">Assets</h2>
        {assets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assets recorded.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Provider</th>
                  <th className="px-3 py-2 text-left font-medium">URL</th>
                  <th className="px-3 py-2 text-left font-medium">Prompt</th>
                  <th className="px-3 py-2 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {assets.map(asset => (
                  <tr key={asset.id} className="border-b last:border-0">
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
                        '—'
                      )}
                    </td>
                    <td className="max-w-md truncate px-3 py-2">
                      {asset.prompt ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDateTime(asset.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="speaker-notes" className="space-y-4">
        <h2 className="text-xl font-semibold">Speaker Notes</h2>
        {slides.length === 0 ? (
          <p className="text-sm text-muted-foreground">No slides yet.</p>
        ) : (
          <div className="space-y-2">
            {slides
              .filter(s => s.hasNotes)
              .map(slide => (
                <Card key={slide.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      Slide {slide.slideIndex + 1}: {slide.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      Speaker notes recorded.
                    </p>
                  </CardContent>
                </Card>
              ))}
            {slides.filter(s => s.hasNotes).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No speaker notes recorded.
              </p>
            ) : null}
          </div>
        )}
      </section>

      <section id="exports" className="space-y-4">
        <h2 className="text-xl font-semibold">Exports</h2>
        {exportsList.length === 0 ? (
          <p className="text-sm text-muted-foreground">No exports yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">URL</th>
                  <th className="px-3 py-2 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {exportsList.map(exp => (
                  <tr key={exp.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <Badge variant="outline">{exp.exportType}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={statusVariant(exp.status)}>
                        {exp.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      {exp.fileUrl ? (
                        <a
                          href={exp.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          download
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDateTime(exp.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="shares" className="space-y-4">
        <h2 className="text-xl font-semibold">Share Links</h2>
        {shares.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No share links generated.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Share ID</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Visibility
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Views</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Last viewed
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Expires</th>
                </tr>
              </thead>
              <tbody>
                {shares.map(share => (
                  <tr key={share.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">
                      {share.shareId}
                    </td>
                    <td className="px-3 py-2">
                      {share.isPublic ? 'Public' : 'Private'}
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
                      {share.expiresAt ? formatDateTime(share.expiresAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="generations" className="space-y-4">
        <h2 className="text-xl font-semibold">Generation Logs</h2>
        {generations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No generation logs yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Model</th>
                  <th className="px-3 py-2 text-left font-medium">Prompt</th>
                  <th className="px-3 py-2 text-right font-medium">In</th>
                  <th className="px-3 py-2 text-right font-medium">Out</th>
                  <th className="px-3 py-2 text-right font-medium">Cost</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {generations.map(gen => (
                  <tr key={gen.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <Badge variant="outline">{gen.generationType}</Badge>
                    </td>
                    <td className="px-3 py-2">{gen.model}</td>
                    <td className="max-w-md truncate px-3 py-2">
                      {gen.prompt}
                    </td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="costs" className="space-y-4">
        <h2 className="text-xl font-semibold">Costs</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Generations
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {generations.length}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tokens
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {deck.totalTokens.toLocaleString()}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Cost
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              ${(totalCost / 100).toFixed(4)}
            </CardContent>
          </Card>
        </div>
      </section>

      <section id="security" className="space-y-4">
        <h2 className="text-xl font-semibold">Security</h2>
        <p className="text-sm text-muted-foreground">
          Share link controls and public visibility.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card>
            <CardContent className="flex items-center justify-between py-4">
              <p className="font-medium">Public share</p>
              <Badge variant={deck.isPublic ? 'destructive' : 'outline'}>
                {deck.isPublic ? 'enabled' : 'private'}
              </Badge>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between py-4">
              <p className="font-medium">Active share links</p>
              <Badge variant="outline">
                {shares.filter(s => s.status === 'active').length}
              </Badge>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
