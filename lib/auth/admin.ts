import { getCurrentUser } from './get-current-user'

function parseList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

export async function requireAdminAccess() {
  const adminUserIds = parseList(process.env.ADMIN_USER_IDS)
  const adminEmails = parseList(process.env.ADMIN_EMAILS).map(email =>
    email.toLowerCase()
  )
  const hasExplicitAdminAllowlist =
    adminUserIds.length > 0 || adminEmails.length > 0

  if (process.env.ENABLE_AUTH === 'false') {
    if (!hasExplicitAdminAllowlist && process.env.NODE_ENV === 'production') {
      return {
        ok: false as const,
        status: 403,
        error: 'Admin allowlist is required in production'
      }
    }

    return { ok: true as const, user: null }
  }

  const user = await getCurrentUser()

  if (!user) {
    return {
      ok: false as const,
      status: 401,
      error: 'Authentication required'
    }
  }

  if (!hasExplicitAdminAllowlist) {
    if (process.env.NODE_ENV === 'production') {
      return {
        ok: false as const,
        status: 403,
        error: 'Admin allowlist is required in production'
      }
    }

    return { ok: true as const, user }
  }

  const isAllowedById = adminUserIds.includes(user.id)
  const isAllowedByEmail = !!user.email
    ? adminEmails.includes(user.email.toLowerCase())
    : false

  if (!isAllowedById && !isAllowedByEmail) {
    return {
      ok: false as const,
      status: 403,
      error: 'Admin access required'
    }
  }

  return { ok: true as const, user }
}
