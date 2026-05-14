import { Bot, Mail, Search, Sparkles, Workflow } from 'lucide-react'

import { WorkspaceHubPage } from '@/components/workspace-hub-page'

const actions = [
  {
    href: '/',
    label: 'AI Search',
    icon: Search,
    description:
      'Run natural-language search and deep citations across the web in one place.',
    metric: 'Fast'
  },
  {
    href: '/brokmail',
    label: 'BrokMail',
    icon: Mail,
    description:
      'Operate inbox workflows with chat-first controls, summaries, and safe approvals.',
    metric: 'Live'
  },
  {
    href: '/brokcode',
    label: 'Brok Code',
    icon: Bot,
    description:
      'Use chat + subagents + runtime preview to build and ship repository changes.',
    metric: 'Agentic'
  },
  {
    href: '/library',
    label: 'Library',
    icon: Sparkles,
    description:
      'Jump into saved assets, reusable prompts, templates, and tracked outputs.'
  },
  {
    href: '/spaces',
    label: 'Spaces',
    icon: Workflow,
    description:
      'Group work by team, customer, or project so context stays organized and reusable.'
  }
]

export default function DiscoverPage() {
  return (
    <WorkspaceHubPage
      title="Discover Brok Workspace"
      subtitle="Navigate product surfaces quickly, keep context connected, and launch core workflows from one fast entry point."
      badge="Discover"
      actions={actions}
    />
  )
}
