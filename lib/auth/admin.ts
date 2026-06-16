import { getCurrentUser } from '@/lib/auth/get-current-user'

import {
  ADMIN_ROLE_CAPABILITIES,
  ADMIN_ROLES,
  AdminRole,
  AdminRoleCapabilities,
  hasCapability,
  resolveAdminRole,
  ResolvedAdminRole
} from './admin-roles'

function parseList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

export interface AdminAccessGrant {
  ok: true
  user: { id: string; email: string | null } | null
  role: AdminRole
  roleSource: ResolvedAdminRole['source']
  capabilities: AdminRoleCapabilities
}

export interface AdminAccessDenied {
  ok: false
  status: 401 | 403
  error: string
}

export type AdminAccessResult = AdminAccessGrant | AdminAccessDenied

function deny(status: 401 | 403, error: string): AdminAccessDenied {
  return { ok: false, status, error }
}

function grant(
  user: { id: string; email: string | null } | null
): AdminAccessGrant {
  const resolved = resolveAdminRole({
    id: user?.id,
    email: user?.email
  })
  return {
    ok: true,
    user,
    role: resolved.role,
    roleSource: resolved.source,
    capabilities: resolved.capabilities
  }
}

export async function requireAdminAccess(): Promise<AdminAccessResult> {
  const adminUserIds = parseList(process.env.ADMIN_USER_IDS)
  const adminEmails = parseList(process.env.ADMIN_EMAILS).map(email =>
    email.toLowerCase()
  )
  const hasExplicitAdminAllowlist =
    adminUserIds.length > 0 || adminEmails.length > 0

  if (process.env.ENABLE_AUTH === 'false') {
    if (!hasExplicitAdminAllowlist && process.env.NODE_ENV === 'production') {
      return deny(401, 'Admin allowlist is required in production')
    }

    return grant(null)
  }

  const user = await getCurrentUser()

  if (!user) {
    return deny(401, 'Authentication required')
  }

  if (!hasExplicitAdminAllowlist) {
    if (process.env.NODE_ENV === 'production') {
      return deny(403, 'Admin allowlist is required in production')
    }

    return grant({ id: user.id, email: user.email ?? null })
  }

  const isAllowedById = adminUserIds.includes(user.id)
  const isAllowedByEmail = !!user.email
    ? adminEmails.includes(user.email.toLowerCase())
    : false

  if (!isAllowedById && !isAllowedByEmail) {
    return deny(403, 'Admin access required')
  }

  return grant({ id: user.id, email: user.email ?? null })
}

export interface RequireRoleOptions {
  anyOf: AdminRole[]
}

export async function requireRole(
  options: RequireRoleOptions
): Promise<AdminAccessResult> {
  const access = await requireAdminAccess()
  if (!access.ok) {
    return access
  }

  if (!options.anyOf.includes(access.role)) {
    return deny(
      403,
      `Role ${access.role} cannot perform this action. Required: ${options.anyOf.join(', ')}`
    )
  }

  return access
}

export async function requireCapability(
  capability: keyof AdminRoleCapabilities
): Promise<AdminAccessResult> {
  const access = await requireAdminAccess()
  if (!access.ok) {
    return access
  }

  if (!hasCapability(access.role, capability)) {
    return deny(
      403,
      `Role ${access.role} lacks capability ${String(capability)}`
    )
  }

  return access
}

export { ADMIN_ROLE_CAPABILITIES, ADMIN_ROLES }
export type { AdminRole, AdminRoleCapabilities }
