import { BookMarked, FileCode2, Inbox, Search, Shapes, WandSparkles } from 'lucide-react'

import { WorkspaceHubPage } from '@/components/workspace-hub-page'

const actions = [
  {
    href: '/',
    label: 'Saved Search Threads',
    icon: Search,
    description:
      'Re-open previous answer chains and citations for fast follow-up research.',
    metric: 'Synced'
  },
  {
    href: '/brokmail',
    label: 'Email Playbooks',
    icon: Inbox,
    description:
      'Reuse reply styles, approval templates, and triage automations in BrokMail.'
  },
  {
    href: '/brokcode',
    label: 'Code Runbooks',
    icon: FileCode2,
    description:
      'Store subagent plans, branch templates, and rollout patterns for repeated delivery.'
  },
  {
    href: '/presentations',
    label: 'Deck Templates',
    icon: Shapes,
    description:
      'Start from reusable outlines, themes, and export presets for predictable quality.'
  },
  {
    href: '/playground',
    label: 'Prompt Lab',
    icon: WandSparkles,
    description:
      'Iterate and tune system prompts before promoting them into production flows.'
  },
  {
    href: '/docs',
    label: 'Reference Docs',
    icon: BookMarked,
    description:
      'Open model, API, and platform docs while staying inside the same workspace.'
  }
]

export default function LibraryPage() {
  return (
    <WorkspaceHubPage
      title="Library"
      subtitle="A reusable layer for templates, prior runs, docs, and repeatable workflows across Brok Search, BrokMail, Brok Code, and Presentations."
      badge="Knowledge Layer"
      actions={actions}
    />
  )
}
