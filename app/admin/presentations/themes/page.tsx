import Link from 'next/link'

import { getPresentationThemesForAdmin } from '@/lib/actions/admin-presentations'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

export default async function AdminPresentationThemesPage() {
  const themes = await getPresentationThemesForAdmin()

  const builtinThemes = themes.filter(theme => theme.isBuiltin)
  const customThemes = themes.filter(theme => !theme.isBuiltin)

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/presentations"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Presentations Admin
        </Link>
        <h1 className="text-3xl font-bold">Themes</h1>
        <p className="text-muted-foreground">
          Theme gallery — 38 built-in themes plus custom themes uploaded by
          users (PPTX import).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total themes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{themes.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Built-in themes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{builtinThemes.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Custom themes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{customThemes.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All themes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Owner</th>
                  <th className="px-3 py-2 text-left font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {themes.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-6 text-center text-muted-foreground"
                    >
                      No themes recorded.
                    </td>
                  </tr>
                ) : (
                  themes.map(theme => (
                    <tr key={theme.id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">{theme.name}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={theme.isBuiltin ? 'default' : 'outline'}
                        >
                          {theme.isBuiltin ? 'built-in' : 'custom'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {theme.ownerId ? (
                          <span className="font-mono text-xs">
                            {theme.ownerId}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">system</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDateTime(theme.updatedAt)}
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
