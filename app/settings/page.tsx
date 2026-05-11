import { KeyRound, LifeBuoy, Mail, SlidersHorizontal, Sparkles, Users } from 'lucide-react'

import { WorkspaceHubPage } from '@/components/workspace-hub-page'

const actions = [
  {
    href: '/api-keys',
    label: 'API Keys',
    icon: KeyRound,
    description:
      'Issue and rotate Brok keys for cloud and CLI usage with scoped permissions.',
    metric: 'Secure'
  },
  {
    href: '/admin/brok/providers',
    label: 'Provider Routes',
    icon: SlidersHorizontal,
    description:
      'Set model routing priorities and cost controls for each Brok model family.'
  },
  {
    href: '/brokmail',
    label: 'BrokMail Preferences',
    icon: Mail,
    description:
      'Tune tone defaults, approval behavior, and inbox automation preferences.'
  },
  {
    href: '/brokcode',
    label: 'Brok Code Runtime',
    icon: Sparkles,
    description:
      'Configure runtime defaults, preview URL, and subagent workflow behavior.'
  },
  {
    href: '/admin',
    label: 'Admin Workspace',
    icon: Users,
    description:
      'Manage platform-wide usage visibility, provider health, and governance controls.'
  },
  {
    href: '/docs/security',
    label: 'Security Docs',
    icon: LifeBuoy,
    description:
      'Reference best practices for key storage, server-only auth, and environment setup.'
  }
]

export default function SettingsPage() {
  return (
    <WorkspaceHubPage
      title="Settings"
      subtitle="Centralized controls for keys, routing, workspace policy, and product defaults across the Brok platform."
      badge="Configuration"
      actions={actions}
    />
  )
}
