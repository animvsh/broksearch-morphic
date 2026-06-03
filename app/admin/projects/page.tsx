import { getAllProjectsForAdmin } from '@/lib/actions/admin-search-projects-logs-data'
import { requirePageAuth } from '@/lib/auth/require-page-auth'

import { AllProjectsTable } from './all-projects-table'

export const dynamic = 'force-dynamic'

const PROJECT_TYPE_LABELS: Record<string, string> = {
  search_thread: 'Search Thread',
  app_project: 'App Project',
  presentation_deck: 'Presentation Deck',
  api_playground_session: 'API Playground Session',
  shared_link: 'Shared Link',
  exported_file: 'Exported File'
}

export default async function AllProjectsPage() {
  await requirePageAuth('/admin/projects')
  const rows = await getAllProjectsForAdmin()

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-bold">All Projects</h1>
        <p className="text-muted-foreground">
          Unified view of every artifact users create in Brok: search threads,
          app projects, decks, playground sessions, shared links, and exports.
        </p>
      </div>
      <AllProjectsTable
        rows={rows.map(row => ({
          ...row,
          typeLabel: PROJECT_TYPE_LABELS[row.type] ?? row.type
        }))}
      />
    </div>
  )
}
