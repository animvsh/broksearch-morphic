'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'

import { StatsCard } from '@/components/admin/presentations/stats-card'

interface Stats {
  presentationsToday: number
  slidesGeneratedToday: number
  exportsToday: number
  generationCost: string
}

interface RecentActivity {
  date: string
  count: number
}

export default function PresentationsOverviewPage() {
  const [stats, setStats] = useState<Stats>({
    presentationsToday: 0,
    slidesGeneratedToday: 0,
    exportsToday: 0,
    generationCost: '0.00'
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recentActivity] = useState<RecentActivity[]>([
    { date: '2026-05-08', count: 12 },
    { date: '2026-05-07', count: 18 },
    { date: '2026-05-06', count: 15 },
    { date: '2026-05-05', count: 22 },
    { date: '2026-05-04', count: 9 },
    { date: '2026-05-03', count: 14 },
    { date: '2026-05-02', count: 11 }
  ])

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/presentations?type=stats')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setStats(data)
    } catch {
      setError('Failed to load stats')
    } finally {
      setLoading(false)
    }
  }

  const maxCount = Math.max(...recentActivity.map(a => a.count), 1)

  const navItems = [
    {
      label: 'Decks',
      href: '/admin/presentations/decks',
      desc: 'Manage presentations'
    },
    {
      label: 'Generations',
      href: '/admin/presentations/generations',
      desc: 'Generation logs'
    },
    {
      label: 'Costs',
      href: '/admin/presentations/costs',
      desc: 'Cost tracking'
    },
    {
      label: 'Abuse',
      href: '/admin/presentations/abuse',
      desc: 'Flagged content'
    }
  ]

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Presentations Admin
          </h1>
          <p className="text-muted-foreground mt-1">
            Overview, management, and monitoring for Brok Presentations
          </p>
        </div>

        {/* Navigation */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {navItems.map(item => (
            <Link key={item.href} href={item.href}>
              <div className="rounded-lg border bg-card p-4 hover:bg-muted/50 transition-colors cursor-pointer">
                <p className="font-medium text-foreground">{item.label}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {item.desc}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* Stats Cards */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Today&apos;s Activity</h2>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg border bg-card p-6 animate-pulse"
                >
                  <div className="h-4 bg-muted rounded w-24 mb-3" />
                  <div className="h-8 bg-muted rounded w-16" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="rounded-lg border bg-card p-6 text-red-500">
              {error}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatsCard
                label="Presentations Today"
                value={stats.presentationsToday}
              />
              <StatsCard
                label="Slides Generated Today"
                value={stats.slidesGeneratedToday}
              />
              <StatsCard label="Exports Today" value={stats.exportsToday} />
              <StatsCard
                label="Generation Cost"
                value={`$${stats.generationCost}`}
                trend={{ value: 5, positive: false }}
              />
            </div>
          )}
        </div>

        {/* 7-Day Activity Chart */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-6">
            Presentations Created (Last 7 Days)
          </h2>
          <div className="flex items-end justify-between gap-2 h-40">
            {recentActivity.map(day => {
              const heightPct = (day.count / maxCount) * 100
              return (
                <div
                  key={day.date}
                  className="flex-1 flex flex-col items-center gap-2"
                >
                  <div className="w-full flex flex-col items-center justify-end h-32">
                    <div
                      className="w-full max-w-12 rounded-t bg-primary/80 transition-all"
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(day.date).toLocaleDateString('en-US', {
                      weekday: 'short'
                    })}
                  </span>
                  <span className="text-sm font-medium">{day.count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/admin/presentations/decks">
              <Button variant="outline">View All Decks</Button>
            </Link>
            <Link href="/admin/presentations/generations">
              <Button variant="outline">Generation Logs</Button>
            </Link>
            <Link href="/admin/presentations/costs">
              <Button variant="outline">Cost Reports</Button>
            </Link>
            <Link href="/admin/presentations/abuse">
              <Button variant="outline">Review Flagged</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
