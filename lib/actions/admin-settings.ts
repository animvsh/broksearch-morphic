'use server'

import { sql } from 'drizzle-orm'

import { requireAdminAccess } from '@/lib/auth/admin'
import {
  ADMIN_ROLE_CAPABILITIES,
  ADMIN_ROLES,
  AdminRole,
  AdminRoleCapabilities
} from '@/lib/auth/admin-roles'
import { BROK_MODELS } from '@/lib/brok/models'
import { db } from '@/lib/db'
import { providerRoutes } from '@/lib/db/schema'

export interface ProviderToggleStatus {
  providerName: string
  activeModelCount: number
  totalModelCount: number
  isActive: boolean
  killSwitch: boolean
}

export interface ModelToggleStatus {
  brokModel: string
  displayName: string
  provider: string
  isActive: boolean
  killSwitch: boolean
}

export interface AdminSettings {
  roles: AdminRole[]
  capabilities: Record<AdminRole, AdminRoleCapabilities>
  providerToggles: ProviderToggleStatus[]
  modelToggles: ModelToggleStatus[]
  killSwitches: {
    providers: Record<string, boolean>
    models: Record<string, boolean>
  }
  flags: {
    allowNewSignups: boolean
    allowNewApiKeys: boolean
    billingPauseAll: boolean
  }
}

function parseBooleanFlag(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback
  return value === 'true' || value === '1'
}

export async function getAdminSettings(): Promise<AdminSettings> {
  const access = await requireAdminAccess()
  if (!access.ok) {
    return {
      roles: [...ADMIN_ROLES],
      capabilities: ADMIN_ROLE_CAPABILITIES,
      providerToggles: [],
      modelToggles: [],
      killSwitches: { providers: {}, models: {} },
      flags: {
        allowNewSignups: true,
        allowNewApiKeys: true,
        billingPauseAll: false
      }
    }
  }

  const providerToggles: ProviderToggleStatus[] = []
  const modelToggles: ModelToggleStatus[] = []

  try {
    const rows = await db
      .select({
        id: providerRoutes.id,
        brokModel: providerRoutes.brokModel,
        providerName: providerRoutes.providerName,
        isActive: providerRoutes.isActive
      })
      .from(providerRoutes)

    const providerMap = new Map<string, ProviderToggleStatus>()

    for (const row of rows) {
      const config = BROK_MODELS[row.brokModel]
      const existing = providerMap.get(row.providerName)
      if (existing) {
        existing.totalModelCount += 1
        if (row.isActive) {
          existing.activeModelCount += 1
        }
      } else {
        providerMap.set(row.providerName, {
          providerName: row.providerName,
          activeModelCount: row.isActive ? 1 : 0,
          totalModelCount: 1,
          isActive: row.isActive,
          killSwitch: false
        })
      }

      modelToggles.push({
        brokModel: row.brokModel,
        displayName: config?.name ?? row.brokModel,
        provider: row.providerName,
        isActive: row.isActive,
        killSwitch: false
      })
    }

    providerToggles.push(...providerMap.values())
  } catch (error) {
    void error
    // fall through with empty toggles when DB is unavailable
  }

  const killSwitches = {
    providers: Object.fromEntries(
      providerToggles.map(p => [p.providerName, p.killSwitch])
    ),
    models: Object.fromEntries(
      modelToggles.map(m => [m.brokModel, m.killSwitch])
    )
  }

  return {
    roles: [...ADMIN_ROLES],
    capabilities: ADMIN_ROLE_CAPABILITIES,
    providerToggles,
    modelToggles,
    killSwitches,
    flags: {
      allowNewSignups: parseBooleanFlag(
        process.env.ADMIN_ALLOW_NEW_SIGNUPS,
        true
      ),
      allowNewApiKeys: parseBooleanFlag(
        process.env.ADMIN_ALLOW_NEW_API_KEYS,
        true
      ),
      billingPauseAll: parseBooleanFlag(
        process.env.ADMIN_BILLING_PAUSE_ALL,
        false
      )
    }
  }
}
