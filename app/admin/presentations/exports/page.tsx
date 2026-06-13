import Link from 'next/link'

import { getPresentationExportsForAdmin } from '@/lib/actions/admin-presentations'

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

function statusVariant(status: string) {
  if (status === 'completed') return 'default' as const
  if (status === 'failed') return 'destructive' as const
  return 'outline' as const
}

export default async function AdminPresentationExportsPage({
  searchParams
}: {
  searchParams: Promise<{ presentationId?: string }>
}) {
  const { presentationId } = await searchParams
  const exportsList = await getPresentationExportsForAdmin(presentationId)

  const pptxCount = exportsList.filter(e => e.exportType === 'pptx').length
  const pdfCount = exportsList.filter(e => e.exportType === 'pdf').length
  const imageCount = exportsList.filter(e => e.exportType === 'image').length

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/presentations"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Presentations Admin
        </Link>
        <h1 className="text-3xl font-bold">Exports</h1>
        <p className="text-muted-foreground">
          PPTX, PDF, and image exports for every deck.
        </p>
        {presentationId ? (
          <p className="text-xs text-muted-foreground">
            Filtered by presentationId: {presentationId} ·{' '}
            <Link
              href="/admin/presentations/exports"
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
          <p className="mt-1 text-2xl font-bold">{exportsList.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-muted-foreground">PPTX</p>
          <p className="mt-1 text-2xl font-bold">{pptxCount}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-muted-foreground">PDF</p>
          <p className="mt-1 text-2xl font-bold">{pdfCount}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-muted-foreground">Image</p>
          <p className="mt-1 text-2xl font-bold">{imageCount}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Deck</th>
              <th className="px-3 py-2 text-left font-medium">Workspace</th>
              <th className="px-3 py-2 text-left font-medium">Type</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">URL</th>
              <th className="px-3 py-2 text-left font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {exportsList.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No exports recorded.
                </td>
              </tr>
            ) : (
              exportsList.map(exp => (
                <tr key={exp.id} className="border-b align-top last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/presentations/decks/${exp.presentationId}`}
                      className="font-medium hover:underline"
                    >
                      {exp.presentationTitle}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{exp.workspaceName}</td>
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
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDateTime(exp.createdAt)}
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
