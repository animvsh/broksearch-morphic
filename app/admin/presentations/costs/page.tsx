'use client'

import { useEffect, useState } from 'react'

import { CostBreakdown } from '@/components/admin/presentations/cost-breakdown'

interface Costs {
  textGeneration: number
  imageGeneration: number
  webSearch: number
  storage: number
  deckCount: number
  dailyCosts?: Array<{ date: string; amount: number }>
}

export default function CostsPage() {
  const [costs, setCosts] = useState<Costs>({
    textGeneration: 0,
    imageGeneration: 0,
    webSearch: 0,
    storage: 0,
    deckCount: 0,
    dailyCosts: []
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchCosts()
  }, [])

  const fetchCosts = async () => {
    try {
      const res = await fetch('/api/admin/presentations?type=costs')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setCosts(data)
    } catch {
      setError('Failed to load cost data')
    } finally {
      setLoading(false)
    }
  }

  const total =
    costs.textGeneration +
    costs.imageGeneration +
    costs.webSearch +
    costs.storage

  const costItems = [
    { label: 'Text Generation', amount: costs.textGeneration },
    { label: 'Image Generation', amount: costs.imageGeneration },
    { label: 'Web Search', amount: costs.webSearch },
    { label: 'Storage', amount: costs.storage }
  ]

  const dailyCosts = costs.dailyCosts ?? []

  const maxDaily = Math.max(...dailyCosts.map(d => d.amount), 0.01)

  const categoryColors: Record<string, string> = {
    'Text Generation': 'bg-blue-500',
    'Image Generation': 'bg-purple-500',
    'Web Search': 'bg-green-500',
    Storage: 'bg-orange-500'
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Cost Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Track and analyze presentation generation costs
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[...Array(2)].map((_, i) => (
              <div
                key={i}
                className="rounded-lg border bg-card p-6 animate-pulse"
              >
                <div className="h-6 bg-muted rounded w-32 mb-4" />
                <div className="space-y-3">
                  {[...Array(4)].map((_, j) => (
                    <div key={j} className="h-4 bg-muted rounded w-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-lg border bg-card p-6 text-red-500">
            {error}
          </div>
        ) : (
          <>
            {/* Cost Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <CostBreakdown items={costItems} />

              {/* Pie Chart Alternative - Category Bars */}
              <div className="rounded-lg border bg-card p-6">
                <h3 className="text-base font-medium mb-4">Cost by Category</h3>
                <div className="space-y-4">
                  {costItems.map(item => {
                    const pct = total > 0 ? (item.amount / total) * 100 : 0
                    return (
                      <div key={item.label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span>{item.label}</span>
                          <span className="font-medium">
                            ${item.amount.toFixed(2)}
                          </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className={
                              categoryColors[item.label] + ' h-2 rounded-full'
                            }
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {pct.toFixed(1)}%
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Daily Cost Bar Chart */}
            <div className="rounded-lg border bg-card p-6">
              <h3 className="text-base font-medium mb-6">
                Daily Cost (Last 7 Days)
              </h3>
              <div className="flex items-end justify-between gap-2 h-48">
                {dailyCosts.map(day => {
                  const heightPct = (day.amount / maxDaily) * 100
                  return (
                    <div
                      key={day.date}
                      className="flex-1 flex flex-col items-center gap-2"
                    >
                      <div className="w-full flex flex-col items-center justify-end h-40">
                        <div
                          className="w-full max-w-16 rounded-t bg-primary/80 transition-all"
                          style={{ height: `${heightPct}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(day.date).toLocaleDateString('en-US', {
                          weekday: 'short'
                        })}
                      </span>
                      <span className="text-sm font-medium">
                        ${day.amount.toFixed(2)}
                      </span>
                    </div>
                  )
                })}
                {dailyCosts.length === 0 && (
                  <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                    No generation cost recorded in the last 7 days.
                  </div>
                )}
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="rounded-lg border bg-card p-6">
                <p className="text-sm text-muted-foreground">Total Cost</p>
                <p className="text-3xl font-bold mt-2">${total.toFixed(2)}</p>
              </div>
              <div className="rounded-lg border bg-card p-6">
                <p className="text-sm text-muted-foreground">Avg. per Deck</p>
                <p className="text-3xl font-bold mt-2">
                  $
                  {total > 0 && costs.deckCount > 0
                    ? (total / costs.deckCount).toFixed(2)
                    : '0.00'}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-6">
                <p className="text-sm text-muted-foreground">
                  Largest Cost Driver
                </p>
                <p className="text-lg font-bold mt-2">
                  {costs.imageGeneration >= costs.textGeneration
                    ? 'Image Gen'
                    : 'Text Gen'}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
