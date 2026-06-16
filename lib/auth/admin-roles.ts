export type AdminRole = 'owner' | 'admin' | 'support' | 'finance' | 'viewer'

export const ADMIN_ROLES: AdminRole[] = [
  'owner',
  'admin',
  'support',
  'finance',
  'viewer'
]

export interface AdminRoleCapabilities {
  canManageUsers: boolean
  canManageProjects: boolean
  canManageDecks: boolean
  canManageApiKeys: boolean
  canManageProviders: boolean
  canViewCosts: boolean
  canViewBilling: boolean
  canChangeLimits: boolean
  canChangeBilling: boolean
  canIssueRefunds: boolean
  canViewLogs: boolean
  canViewProviderSecrets: boolean
  canToggleModel: boolean
  canToggleProvider: boolean
  canModerateContent: boolean
  canReadOnly: boolean
}

export const ADMIN_ROLE_CAPABILITIES: Record<AdminRole, AdminRoleCapabilities> =
  {
    owner: {
      canManageUsers: true,
      canManageProjects: true,
      canManageDecks: true,
      canManageApiKeys: true,
      canManageProviders: true,
      canViewCosts: true,
      canViewBilling: true,
      canChangeLimits: true,
      canChangeBilling: true,
      canIssueRefunds: true,
      canViewLogs: true,
      canViewProviderSecrets: true,
      canToggleModel: true,
      canToggleProvider: true,
      canModerateContent: true,
      canReadOnly: false
    },
    admin: {
      canManageUsers: true,
      canManageProjects: true,
      canManageDecks: true,
      canManageApiKeys: true,
      canManageProviders: true,
      canViewCosts: true,
      canViewBilling: false,
      canChangeLimits: true,
      canChangeBilling: false,
      canIssueRefunds: false,
      canViewLogs: true,
      canViewProviderSecrets: true,
      canToggleModel: true,
      canToggleProvider: true,
      canModerateContent: true,
      canReadOnly: false
    },
    support: {
      canManageUsers: false,
      canManageProjects: false,
      canManageDecks: false,
      canManageApiKeys: false,
      canManageProviders: false,
      canViewCosts: false,
      canViewBilling: false,
      canChangeLimits: false,
      canChangeBilling: false,
      canIssueRefunds: false,
      canViewLogs: true,
      canViewProviderSecrets: false,
      canToggleModel: false,
      canToggleProvider: false,
      canModerateContent: false,
      canReadOnly: false
    },
    finance: {
      canManageUsers: false,
      canManageProjects: false,
      canManageDecks: false,
      canManageApiKeys: false,
      canManageProviders: false,
      canViewCosts: true,
      canViewBilling: true,
      canChangeLimits: false,
      canChangeBilling: false,
      canIssueRefunds: true,
      canViewLogs: false,
      canViewProviderSecrets: false,
      canToggleModel: false,
      canToggleProvider: false,
      canModerateContent: false,
      canReadOnly: false
    },
    viewer: {
      canManageUsers: false,
      canManageProjects: false,
      canManageDecks: false,
      canManageApiKeys: false,
      canManageProviders: false,
      canViewCosts: true,
      canViewBilling: false,
      canChangeLimits: false,
      canChangeBilling: false,
      canIssueRefunds: false,
      canViewLogs: true,
      canViewProviderSecrets: false,
      canToggleModel: false,
      canToggleProvider: false,
      canModerateContent: false,
      canReadOnly: true
    }
  }

function parseAdminRoles(value: string | undefined): Record<string, AdminRole> {
  if (!value) return {}
  const result: Record<string, AdminRole> = {}
  for (const entry of value.split(',')) {
    const [identifier, role] = entry.split(':').map(part => part.trim())
    if (!identifier || !role) continue
    if (!ADMIN_ROLES.includes(role as AdminRole)) continue
    result[identifier.toLowerCase()] = role as AdminRole
  }
  return result
}

function parseRoleList(value: string | undefined): AdminRole[] {
  if (!value) return []
  return value
    .split(',')
    .map(item => item.trim())
    .filter((item): item is AdminRole =>
      ADMIN_ROLES.includes(item as AdminRole)
    )
}

export interface ResolvedAdminRole {
  role: AdminRole
  source: 'env' | 'allowlist' | 'default'
  capabilities: AdminRoleCapabilities
}

export function resolveAdminRole(identifiers: {
  id?: string | null
  email?: string | null
}): ResolvedAdminRole {
  const byId = parseAdminRoles(process.env.ADMIN_ROLE_USER_IDS)
  const byEmail = parseAdminRoles(process.env.ADMIN_ROLE_EMAILS)

  const matched = (() => {
    if (identifiers.id) {
      const fromId = byId[identifiers.id.toLowerCase()]
      if (fromId) return { role: fromId, source: 'env' as const }
    }
    if (identifiers.email) {
      const fromEmail = byEmail[identifiers.email.toLowerCase()]
      if (fromEmail) return { role: fromEmail, source: 'env' as const }
    }
    return null
  })()

  if (matched) {
    return {
      role: matched.role,
      source: matched.source,
      capabilities: ADMIN_ROLE_CAPABILITIES[matched.role]
    }
  }

  const defaultRole =
    (process.env.ADMIN_DEFAULT_ROLE as AdminRole | undefined) ?? 'admin'

  if (!ADMIN_ROLES.includes(defaultRole)) {
    return {
      role: 'admin',
      source: 'default',
      capabilities: ADMIN_ROLE_CAPABILITIES.admin
    }
  }

  return {
    role: defaultRole,
    source: 'allowlist',
    capabilities: ADMIN_ROLE_CAPABILITIES[defaultRole]
  }
}

export function hasCapability(
  role: AdminRole,
  capability: keyof AdminRoleCapabilities
): boolean {
  return ADMIN_ROLE_CAPABILITIES[role][capability] === true
}

export function listConfiguredAdminRoles(): AdminRole[] {
  const explicit = parseRoleList(process.env.ADMIN_ROLES)
  if (explicit.length > 0) {
    return explicit.filter(role => ADMIN_ROLES.includes(role))
  }
  return [...ADMIN_ROLES]
}
