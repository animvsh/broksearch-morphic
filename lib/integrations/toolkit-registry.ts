export type ConnectorAction =
  | 'connect'
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'send'
  | 'schedule'

export type ConnectorToolkitDefinition = {
  slug: string
  aliases: string[]
  name: string
  description: string
  envKeys: string[]
  readActions: ConnectorAction[]
  mutatingActions: ConnectorAction[]
}

export const CONNECTOR_TOOLKITS: ConnectorToolkitDefinition[] = [
  {
    slug: 'googlesuper',
    aliases: ['googlesuper', 'google_super'],
    name: 'Google Super',
    description:
      'One Google Workspace connection for mail, calendar, docs, drive, and workspace workflows.',
    envKeys: [
      'COMPOSIO_GOOGLESUPER_AUTH_CONFIG_ID',
      'COMPOSIO_GOOGLE_SUPER_AUTH_CONFIG_ID'
    ],
    readActions: ['read'],
    mutatingActions: ['create', 'update', 'delete', 'send', 'schedule']
  },
  {
    slug: 'gmail',
    aliases: ['gmail', 'mail', 'email'],
    name: 'Gmail',
    description:
      'Read, search, draft, and triage mailbox workflows through Composio.',
    envKeys: ['COMPOSIO_GMAIL_AUTH_CONFIG_ID'],
    readActions: ['read'],
    mutatingActions: ['create', 'update', 'delete', 'send']
  },
  {
    slug: 'googlecalendar',
    aliases: ['calendar', 'gcal', 'google-calendar', 'google_calendar'],
    name: 'Google Calendar',
    description:
      'Inspect and manage calendar events with approval-aware agent actions.',
    envKeys: [
      'COMPOSIO_GCAL_AUTH_CONFIG_ID',
      'COMPOSIO_GOOGLECALENDAR_AUTH_CONFIG_ID',
      'COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID'
    ],
    readActions: ['read'],
    mutatingActions: ['create', 'update', 'delete', 'schedule']
  },
  {
    slug: 'googledocs',
    aliases: ['docs', 'googledocs', 'google-docs', 'google_docs'],
    name: 'Google Docs',
    description:
      'Create, read, and update Google Docs through connected Workspace workflows.',
    envKeys: [
      'COMPOSIO_GOOGLEDOCS_AUTH_CONFIG_ID',
      'COMPOSIO_GOOGLE_DOCS_AUTH_CONFIG_ID'
    ],
    readActions: ['read'],
    mutatingActions: ['create', 'update', 'delete']
  },
  {
    slug: 'googleslides',
    aliases: [
      'deck',
      'decks',
      'presentation',
      'presentations',
      'slides',
      'google-slides',
      'google_slides',
      'googleslides'
    ],
    name: 'Google Slides',
    description:
      'Create, read, and update presentation decks from approved Brok actions.',
    envKeys: [
      'COMPOSIO_GOOGLESLIDES_AUTH_CONFIG_ID',
      'COMPOSIO_GOOGLE_SLIDES_AUTH_CONFIG_ID'
    ],
    readActions: ['read'],
    mutatingActions: ['create', 'update', 'delete']
  },
  {
    slug: 'googlemeet',
    aliases: ['meet', 'google-meet', 'google_meet', 'googlemeet'],
    name: 'Google Meet',
    description:
      'Schedule, inspect, and coordinate Meet workflows from agent actions.',
    envKeys: [
      'COMPOSIO_GOOGLEMEET_AUTH_CONFIG_ID',
      'COMPOSIO_GOOGLE_MEET_AUTH_CONFIG_ID'
    ],
    readActions: ['read'],
    mutatingActions: ['create', 'update', 'delete', 'schedule']
  },
  {
    slug: 'github',
    aliases: ['github', 'gh'],
    name: 'GitHub',
    description:
      'Inspect repositories and prepare approved code collaboration actions.',
    envKeys: ['COMPOSIO_GITHUB_AUTH_CONFIG_ID'],
    readActions: ['read'],
    mutatingActions: ['create', 'update', 'delete']
  },
  {
    slug: 'linear',
    aliases: ['linear'],
    name: 'Linear',
    description:
      'Read and manage Linear issues through approval-aware agent actions.',
    envKeys: ['COMPOSIO_LINEAR_AUTH_CONFIG_ID'],
    readActions: ['read'],
    mutatingActions: ['create', 'update', 'delete']
  },
  {
    slug: 'slack',
    aliases: ['slack'],
    name: 'Slack',
    description:
      'Inspect channels and prepare approved Slack workspace actions.',
    envKeys: ['COMPOSIO_SLACK_AUTH_CONFIG_ID'],
    readActions: ['read'],
    mutatingActions: ['create', 'update', 'delete', 'send']
  },
  {
    slug: 'supabase',
    aliases: ['supabase'],
    name: 'Supabase',
    description: 'Inspect Supabase project state for connected app workflows.',
    envKeys: ['COMPOSIO_SUPABASE_AUTH_CONFIG_ID'],
    readActions: ['read'],
    mutatingActions: ['create', 'update', 'delete']
  }
]

const TOOLKIT_BY_ALIAS = new Map<string, ConnectorToolkitDefinition>()

for (const toolkit of CONNECTOR_TOOLKITS) {
  TOOLKIT_BY_ALIAS.set(toolkit.slug, toolkit)
  for (const alias of toolkit.aliases) {
    TOOLKIT_BY_ALIAS.set(alias, toolkit)
  }
}

export function normalizeConnectorToolkit(value: string | null | undefined) {
  const normalized = (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')

  return TOOLKIT_BY_ALIAS.get(normalized)?.slug || normalized
}

export function getConnectorToolkitDefinition(
  value: string | null | undefined
) {
  const slug = normalizeConnectorToolkit(value)
  return CONNECTOR_TOOLKITS.find(toolkit => toolkit.slug === slug)
}

export function getConnectorToolkitEnvKeys(value: string | null | undefined) {
  return getConnectorToolkitDefinition(value)?.envKeys ?? []
}

export function getDefaultConnectorToolkitSlugs() {
  return CONNECTOR_TOOLKITS.filter(toolkit => toolkit.slug !== 'supabase').map(
    toolkit => toolkit.slug
  )
}
