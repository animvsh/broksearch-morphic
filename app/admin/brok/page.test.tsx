import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const grantAppAccessByEmail = vi.fn()
const rejectAppAccessRequest = vi.fn()
const addAppAccessAllowlistEmail = vi.fn()
const updateAppAccessAllowlistFeatures = vi.fn()
const revokeAppAccessAllowlistEmail = vi.fn()

vi.mock('@/lib/auth/require-page-auth', () => ({
  requirePageAuth: vi.fn()
}))

vi.mock('@/components/admin/universal-search', () => ({
  UniversalAdminSearch: () => <div data-testid="admin-search" />
}))

vi.mock('@/lib/actions/admin-access', () => ({
  grantAppAccessByEmail,
  rejectAppAccessRequest
}))

vi.mock('@/lib/actions/admin-brok', () => ({
  addAppAccessAllowlistEmail,
  getAppAccessAllowlist: vi.fn(async () => []),
  getAppAccessRequests: vi.fn(async () => [
    {
      id: 'request-1',
      email: 'builder@example.com',
      phoneNumber: '+15551234567',
      status: 'pending',
      userId: null,
      source: 'login',
      createdAt: new Date('2026-06-17T10:00:00.000Z'),
      updatedAt: new Date('2026-06-17T10:00:00.000Z')
    },
    {
      id: 'request-2',
      email: 'approved@example.com',
      phoneNumber: '+15559876543',
      status: 'approved',
      userId: null,
      source: 'access_pending',
      createdAt: new Date('2026-06-17T09:00:00.000Z'),
      updatedAt: new Date('2026-06-17T09:00:00.000Z')
    }
  ]),
  getBrokStats: vi.fn(async () => zeroStats()),
  revokeAppAccessAllowlistEmail,
  updateAppAccessAllowlistFeatures
}))

import BrokAdminPage from './page'

function zeroStats() {
  return {
    requestsToday: 0,
    tokensToday: 0,
    revenueToday: 0,
    providerCostToday: 0,
    failedRequests: 0,
    avgLatencyMs: 0,
    activeApiKeys: 0,
    topUsersByUsage: [],
    modelUsage: [],
    brokCode: {
      today: {
        requests: 0,
        tokens: 0,
        successRate: 0,
        avgLatencyMs: 0
      },
      last7Days: {
        requests: 0,
        tokens: 0,
        activeUsers: 0,
        activeApiKeys: 0,
        revenue: 0,
        providerCost: 0
      },
      dailyUsage: [
        {
          day: '2026-06-17',
          requests: 0,
          tokens: 0,
          failedRequests: 0
        }
      ],
      runtimeSplit: [],
      endpointSplit: [],
      topUsers: [],
      topApiKeys: [],
      recentRuns: []
    }
  }
}

describe('BrokAdminPage', () => {
  it('lets admins approve or reject pending access requests from the Brok dashboard', async () => {
    render(await BrokAdminPage())

    expect(screen.getByText('builder@example.com')).toBeInTheDocument()
    expect(screen.getByText('+15551234567')).toBeInTheDocument()

    const grantButtons = screen.getAllByRole('button', { name: 'Grant all' })
    const rejectButtons = screen.getAllByRole('button', { name: 'Reject' })

    expect(grantButtons).toHaveLength(2)
    expect(rejectButtons).toHaveLength(2)
    expect(grantButtons[0]).not.toBeDisabled()
    expect(rejectButtons[0]).not.toBeDisabled()
    expect(grantButtons[1]).toBeDisabled()
    expect(rejectButtons[1]).toBeDisabled()
  })
})
