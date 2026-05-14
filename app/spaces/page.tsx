import { Bot, FolderKanban, GitBranch, Mail, Search } from 'lucide-react'

import { WorkspaceHubPage } from '@/components/workspace-hub-page'

const actions = [
  {
    href: '/',
    label: 'Research Space',
    icon: Search,
    description:
      'Track active investigations with pinned sources, summary snapshots, and follow-up prompts.',
    metric: 'Space'
  },
  {
    href: '/brokmail',
    label: 'Inbox Space',
    icon: Mail,
    description:
      'Manage people, follow-ups, and approvals with a dedicated chat + email workspace.'
  },
  {
    href: '/brokcode',
    label: 'Build Space',
    icon: Bot,
    description:
      'Operate coding runs with visible subagent lanes, browser preview, and command history.'
  },
  {
    href: '/admin/brok',
    label: 'Ops Space',
    icon: FolderKanban,
    description:
      'Review provider routing, key activity, and usage telemetry from the admin control surface.'
  },
  {
    href: '/api-keys',
    label: 'Key Space',
    icon: GitBranch,
    description:
      'Manage access keys and rollouts for CLI and cloud integrations with clear scope control.'
  }
]

export default function SpacesPage() {
  return (
    <WorkspaceHubPage
      title="Spaces"
      subtitle="Organize work by context so research, email, coding, and operations stay coherent as the platform scales."
      badge="Workspace Router"
      actions={actions}
    />
  )
}
