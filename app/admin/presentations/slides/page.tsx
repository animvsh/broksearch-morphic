import Link from 'next/link'

import { getPresentationSlidesForAdmin } from '@/lib/actions/admin-presentations'

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

export default async function AdminPresentationSlidesPage({
  searchParams
}: {
  searchParams: Promise<{ presentationId?: string }>
}) {
  const { presentationId } = await searchParams
  const slides = await getPresentationSlidesForAdmin(presentationId)

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Slides</h1>
        <p className="text-muted-foreground">
          Slide thumbnails and metadata across all decks.
        </p>
        {presentationId ? (
          <p className="text-xs text-muted-foreground">
            Filtered by presentationId: {presentationId} ·{' '}
            <Link
              href="/admin/presentations/slides"
              className="text-primary hover:underline"
            >
              clear
            </Link>
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Deck</th>
              <th className="px-3 py-2 text-left font-medium">Workspace</th>
              <th className="px-3 py-2 text-right font-medium">Index</th>
              <th className="px-3 py-2 text-left font-medium">Title</th>
              <th className="px-3 py-2 text-left font-medium">Layout</th>
              <th className="px-3 py-2 text-left font-medium">Notes</th>
              <th className="px-3 py-2 text-left font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {slides.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No slides recorded.
                </td>
              </tr>
            ) : (
              slides.map(slide => (
                <tr key={slide.id} className="border-b align-top last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/presentations/decks/${slide.presentationId}`}
                      className="font-medium hover:underline"
                    >
                      {slide.presentationTitle}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{slide.workspaceName}</td>
                  <td className="px-3 py-2 text-right">
                    {slide.slideIndex + 1}
                  </td>
                  <td className="px-3 py-2">{slide.title}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{slide.layoutType}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    {slide.hasNotes ? (
                      <Badge variant="default">present</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDateTime(slide.updatedAt)}
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
