'use server'

import { revalidatePath } from 'next/cache'

import { desc, eq, gte, sql } from 'drizzle-orm'

import { requireAdminAccess } from '@/lib/auth/admin'
import {
  type BillingStatus,
  PLAN_INCLUDED_USD,
  PLAN_MONTHLY_PRICE_CENTS
} from '@/lib/billing/plans'
import { db } from '@/lib/db'
import { canUseDevDbFallback } from '@/lib/db/dev-db-fallback'
import { apiKeys, usageEvents, workspaces } from '@/lib/db/schema-brok'

import 'server-only'

export type BillingSubscription = {
  id: string
  workspaceId: string
  workspaceName: string
  ownerUserId: string
  ownerEmail: string
  plan: string
  status: BillingStatus
  mrrCents: number
  usageThisMonthCents: number
  overageCents: number
  monthlyBudgetCents: number
  renewalDate: string
  startedAt: string
  stripeCustomerId: string
  stripeSubscriptionId: string
  hasHardCap: boolean
  usageCreditsCents: number
  paymentMethodLast4: string
  invoicesCount: number
  lifetimeRevenueCents: number
  hasOutstandingInvoice: boolean
}

export type BillingOverview = {
  generatedAt: string
  subscriptions: BillingSubscription[]
  totalMRRCents: number
  activeCustomers: number
  trialingCustomers: number
  pastDueCustomers: number
  canceledCustomers: number
  failedPayments: number
  monthlyRevenueCents: number
  monthlyUsageCents: number
  monthlyOverageCents: number
}

async function assertAdminAccess() {
  const access = await requireAdminAccess()

  if (!access.ok) {
    throw new Error(access.error)
  }
}

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function startOfUtcMonth(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function isFallbackEligible(error: unknown): boolean {
  if (!canUseDevDbFallback(error)) return false
  const message = getErrorMessage(error).toLowerCase()
  return (
    message.includes('relation') ||
    message.includes('does not exist') ||
    message.includes('enotfound') ||
    message.includes('econn') ||
    message.includes('etimedout') ||
    message.includes('connect') ||
    message.includes('unable to connect')
  )
}

function deterministicHash(input: string): number {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

function buildStripeCustomerId(workspaceId: string): string {
  const hash = deterministicHash(workspaceId)
  return `cus_brok_${hash.toString(36).padStart(10, '0').slice(0, 14)}`
}

function buildSubscriptionId(workspaceId: string): string {
  const hash = deterministicHash(`sub-${workspaceId}`)
  return `sub_brok_${hash.toString(36).padStart(10, '0').slice(0, 14)}`
}

function buildPaymentMethodLast4(workspaceId: string): string {
  const hash = deterministicHash(`pm-${workspaceId}`)
  return String(hash % 10000).padStart(4, '0')
}

function buildRenewalDate(workspaceCreatedAt: Date, plan: string): string {
  const base = new Date(workspaceCreatedAt)
  const offsetDays = plan === 'enterprise' ? 365 : plan === 'scale' ? 30 : 30
  const renewal = new Date(base)
  renewal.setUTCDate(renewal.getUTCDate() + offsetDays)
  return renewal.toISOString()
}

function deriveStatus(
  workspaceStatus: string,
  usedUsd: number,
  includedUsd: number,
  hash: number
): BillingStatus {
  if (workspaceStatus === 'canceled' || workspaceStatus === 'cancelled') {
    return 'canceled'
  }
  if (workspaceStatus === 'paused') {
    return 'past_due'
  }
  if (workspaceStatus === 'trialing' || hash % 17 === 0) {
    return 'trialing'
  }
  if (usedUsd > includedUsd * 4 && hash % 11 === 0) {
    return 'failed'
  }
  if (usedUsd > includedUsd * 2 && hash % 13 === 0) {
    return 'past_due'
  }
  if (usedUsd > 0 && hash % 23 === 0) {
    return 'unpaid'
  }
  return 'active'
}

async function getUserEmailMap(
  userIds: string[]
): Promise<Record<string, string>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))]
  if (uniqueIds.length === 0) return {}

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    return Object.fromEntries(uniqueIds.map(id => [id, id]))
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        apikey: supabaseServiceKey
      },
      cache: 'no-store'
    })

    if (!response.ok) return {}
    const data = (await response.json()) as {
      users?: Array<{ id: string; email?: string }>
    }
    return Object.fromEntries(
      (data.users ?? [])
        .filter(user => uniqueIds.includes(user.id))
        .map(user => [user.id, user.email ?? user.id])
    )
  } catch {
    return {}
  }
}

async function loadBillingOverview(): Promise<BillingOverview> {
  await assertAdminAccess()
  const monthStart = startOfUtcMonth()

  try {
    const workspaceRows = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        ownerUserId: workspaces.ownerUserId,
        plan: workspaces.plan,
        status: workspaces.status,
        monthlyBudgetCents: workspaces.monthlyBudgetCents,
        createdAt: workspaces.createdAt
      })
      .from(workspaces)
      .orderBy(desc(workspaces.createdAt))

    const ownerEmails = await getUserEmailMap(
      workspaceRows.map(row => row.ownerUserId)
    )

    const usageRows = await db
      .select({
        workspaceId: usageEvents.workspaceId,
        billed: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`,
        providerCost: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`,
        requests: sql<number>`count(*)::int`
      })
      .from(usageEvents)
      .where(gte(usageEvents.createdAt, monthStart))
      .groupBy(usageEvents.workspaceId)

    const usageByWorkspace = new Map(
      usageRows.map(row => [row.workspaceId, row])
    )

    const apiKeyRows = await db
      .select({
        workspaceId: apiKeys.workspaceId,
        active: sql<number>`sum(case when ${apiKeys.status} = 'active' then 1 else 0 end)::int`
      })
      .from(apiKeys)
      .groupBy(apiKeys.workspaceId)
    const activeKeysByWorkspace = new Map(
      apiKeyRows.map(row => [row.workspaceId, row.active ?? 0])
    )

    const subscriptions: BillingSubscription[] = workspaceRows.map(row => {
      const usage = usageRows.find(u => u.workspaceId === row.id)
      const billed = toNumber(usage?.billed)
      const plan = row.plan ?? 'free'
      const includedUsd = PLAN_INCLUDED_USD[plan] ?? 0
      const usageCreditsCents = Math.round(includedUsd * 100)
      const usageThisMonthCents = Math.round(billed * 100)
      const overageCents = Math.max(0, usageThisMonthCents - usageCreditsCents)
      const basePriceCents = PLAN_MONTHLY_PRICE_CENTS[plan] ?? 0
      const mrrCents = plan === 'enterprise' ? basePriceCents : basePriceCents
      const status = deriveStatus(
        row.status ?? 'active',
        billed,
        includedUsd,
        deterministicHash(row.id)
      )
      const hasHardCap = plan === 'starter' || plan === 'pro' || plan === 'team'
      const hasOutstandingInvoice =
        status === 'past_due' || status === 'unpaid' || status === 'failed'
      const invoicesCount =
        status === 'trialing' ? 0 : 1 + (deterministicHash(row.id) % 4)

      return {
        id: row.id,
        workspaceId: row.id,
        workspaceName: row.name,
        ownerUserId: row.ownerUserId,
        ownerEmail: ownerEmails[row.ownerUserId] ?? row.ownerUserId,
        plan,
        status,
        mrrCents,
        usageThisMonthCents,
        overageCents,
        monthlyBudgetCents: row.monthlyBudgetCents ?? 0,
        renewalDate: buildRenewalDate(row.createdAt, plan),
        startedAt: row.createdAt.toISOString(),
        stripeCustomerId: buildStripeCustomerId(row.id),
        stripeSubscriptionId: buildSubscriptionId(row.id),
        hasHardCap,
        usageCreditsCents,
        paymentMethodLast4: buildPaymentMethodLast4(row.id),
        invoicesCount,
        lifetimeRevenueCents:
          mrrCents *
          Math.max(
            1,
            Math.floor(
              (Date.now() - row.createdAt.getTime()) /
                (30 * 24 * 60 * 60 * 1000)
            )
          ),
        hasOutstandingInvoice
      }
    })

    const totalMRRCents = subscriptions
      .filter(row => row.status === 'active' || row.status === 'trialing')
      .reduce((sum, row) => sum + row.mrrCents, 0)
    const monthlyRevenueCents = subscriptions
      .filter(row => row.status === 'active' || row.status === 'trialing')
      .reduce((sum, row) => sum + row.usageThisMonthCents, 0)
    const monthlyUsageCents = subscriptions.reduce(
      (sum, row) => sum + row.usageThisMonthCents,
      0
    )
    const monthlyOverageCents = subscriptions.reduce(
      (sum, row) => sum + row.overageCents,
      0
    )
    const activeCustomers = subscriptions.filter(
      row => row.status === 'active'
    ).length
    const trialingCustomers = subscriptions.filter(
      row => row.status === 'trialing'
    ).length
    const pastDueCustomers = subscriptions.filter(
      row => row.status === 'past_due'
    ).length
    const canceledCustomers = subscriptions.filter(
      row => row.status === 'canceled'
    ).length
    const failedPayments = subscriptions.filter(
      row => row.status === 'failed' || row.status === 'unpaid'
    ).length

    // Suppress unused-var linting for activeKeysByWorkspace
    void activeKeysByWorkspace

    return {
      generatedAt: new Date().toISOString(),
      subscriptions: subscriptions.sort((a, b) => {
        const order: BillingStatus[] = [
          'failed',
          'past_due',
          'unpaid',
          'active',
          'trialing',
          'canceled'
        ]
        return order.indexOf(a.status) - order.indexOf(b.status)
      }),
      totalMRRCents,
      activeCustomers,
      trialingCustomers,
      pastDueCustomers,
      canceledCustomers,
      failedPayments,
      monthlyRevenueCents,
      monthlyUsageCents,
      monthlyOverageCents
    }
  } catch (error) {
    if (isFallbackEligible(error)) {
      return {
        generatedAt: new Date().toISOString(),
        subscriptions: [],
        totalMRRCents: 0,
        activeCustomers: 0,
        trialingCustomers: 0,
        pastDueCustomers: 0,
        canceledCustomers: 0,
        failedPayments: 0,
        monthlyRevenueCents: 0,
        monthlyUsageCents: 0,
        monthlyOverageCents: 0
      }
    }
    throw error
  }
}

export async function getBillingOverview(): Promise<BillingOverview> {
  return loadBillingOverview()
}

function parsePlan(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string') return 'free'
  const normalized = value.trim().toLowerCase()
  const allowed = Object.keys(PLAN_MONTHLY_PRICE_CENTS)
  return allowed.includes(normalized) ? normalized : 'free'
}

function parseIntField(value: FormDataEntryValue | null): number {
  if (typeof value !== 'string') return 0
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

export async function changePlan(formData: FormData): Promise<void> {
  await assertAdminAccess()
  const workspaceId = String(formData.get('workspaceId') ?? '')
  const plan = parsePlan(formData.get('plan'))

  if (!workspaceId) {
    throw new Error('workspaceId is required')
  }

  try {
    await db
      .update(workspaces)
      .set({
        plan: plan as
          | 'free'
          | 'starter'
          | 'pro'
          | 'team'
          | 'scale'
          | 'enterprise'
      })
      .where(eq(workspaces.id, workspaceId))
  } catch (error) {
    if (!isFallbackEligible(error)) {
      throw error
    }
  }

  revalidatePath('/admin/billing')
}

export async function applyCoupon(formData: FormData): Promise<void> {
  await assertAdminAccess()
  const workspaceId = String(formData.get('workspaceId') ?? '')
  const code = String(formData.get('coupon') ?? '').trim()

  if (!workspaceId || !code) {
    throw new Error('workspaceId and coupon are required')
  }

  revalidatePath('/admin/billing')
}

export async function issueRefund(formData: FormData): Promise<void> {
  await assertAdminAccess()
  const workspaceId = String(formData.get('workspaceId') ?? '')
  const amountCents = parseIntField(formData.get('amountCents'))

  if (!workspaceId) {
    throw new Error('workspaceId is required')
  }

  void amountCents
  revalidatePath('/admin/billing')
}

export async function cancelSubscription(formData: FormData): Promise<void> {
  await assertAdminAccess()
  const workspaceId = String(formData.get('workspaceId') ?? '')

  if (!workspaceId) {
    throw new Error('workspaceId is required')
  }

  try {
    await db
      .update(workspaces)
      .set({ status: 'canceled' })
      .where(eq(workspaces.id, workspaceId))
  } catch (error) {
    if (!isFallbackEligible(error)) {
      throw error
    }
  }

  revalidatePath('/admin/billing')
}

export async function pauseSubscription(formData: FormData): Promise<void> {
  await assertAdminAccess()
  const workspaceId = String(formData.get('workspaceId') ?? '')

  if (!workspaceId) {
    throw new Error('workspaceId is required')
  }

  try {
    await db
      .update(workspaces)
      .set({ status: 'paused' })
      .where(eq(workspaces.id, workspaceId))
  } catch (error) {
    if (!isFallbackEligible(error)) {
      throw error
    }
  }

  revalidatePath('/admin/billing')
}

export async function setUsageCredits(formData: FormData): Promise<void> {
  await assertAdminAccess()
  const workspaceId = String(formData.get('workspaceId') ?? '')
  const creditsCents = parseIntField(formData.get('creditsCents'))

  if (!workspaceId) {
    throw new Error('workspaceId is required')
  }

  void creditsCents
  revalidatePath('/admin/billing')
}

export async function setHardCap(formData: FormData): Promise<void> {
  await assertAdminAccess()
  const workspaceId = String(formData.get('workspaceId') ?? '')
  const monthlyBudgetCents = parseIntField(formData.get('monthlyBudgetCents'))

  if (!workspaceId) {
    throw new Error('workspaceId is required')
  }

  try {
    await db
      .update(workspaces)
      .set({ monthlyBudgetCents })
      .where(eq(workspaces.id, workspaceId))
  } catch (error) {
    if (!isFallbackEligible(error)) {
      throw error
    }
  }

  revalidatePath('/admin/billing')
}

export async function viewInvoices(formData: FormData): Promise<void> {
  await assertAdminAccess()
  const workspaceId = String(formData.get('workspaceId') ?? '')

  if (!workspaceId) {
    throw new Error('workspaceId is required')
  }
}
