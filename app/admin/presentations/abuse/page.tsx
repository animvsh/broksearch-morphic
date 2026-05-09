'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DataTable, Column } from '@/components/admin/presentations/data-table'

interface FlaggedPresentation {
  id: string
  title: string
  user_id: string
  status: string
  slide_count: number
  created_at: string
  reason: string
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export default function AbusePage() {
  const [flagged, setFlagged] = useState<FlaggedPresentation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchFlagged()
  }, [])

  const fetchFlagged = async () => {
    try {
      const res = await fetch('/api/admin/presentations?type=flagged')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setFlagged(data.flagged || [])
    } catch {
      setError('Failed to load flagged presentations')
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (id: string, action: 'view' | 'suspend' | 'delete') => {
    if (action === 'view') {
      window.open(`/presentations/${id}/editor`, '_blank')
    } else if (action === 'delete') {
      if (!confirm('Are you sure you want to delete this presentation?')) return
      // In a real implementation, this would call a DELETE API
      alert('Delete functionality would be implemented here')
    } else if (action === 'suspend') {
      alert('Suspend functionality would be implemented here')
    }
  }

  const columns: Column<FlaggedPresentation>[] = [
    {
      key: 'created_at',
      label: 'Time',
      sortable: true,
      render: (row) => (
        <span className="text-muted-foreground text-xs">
          {formatRelativeTime(row.created_at)}
        </span>
      )
    },
    {
      key: 'title',
      label: 'Presentation',
      render: (row) => (
        <div>
          <p className="font-medium">{row.title}</p>
          <p className="text-xs text-muted-foreground font-mono">
            {row.id.slice(0, 8)}...
          </p>
        </div>
      )
    },
    {
      key: 'reason',
      label: 'Reason',
      render: (row) => (
        <span className="text-sm text-red-600 font-medium">{row.reason}</span>
      )
    },
    {
      key: 'user_id',
      label: 'User',
      sortable: true,
      render: (row) => (
        <span className="font-mono text-xs">{row.user_id.slice(0, 8)}...</span>
      )
    },
    {
      key: 'actions',
      label: 'Action',
      render: (row) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction(row.id, 'view')}
          >
            View
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction(row.id, 'suspend')}
          >
            Suspend
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleAction(row.id, 'delete')}
          >
            Delete
          </Button>
        </div>
      )
    }
  ]

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Abuse Monitoring</h1>
          <p className="text-muted-foreground mt-1">
            Flagged presentations and suspicious activity
          </p>
        </div>

        {/* Abuse Detection Criteria */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Detection Criteria</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="font-medium text-sm">High Generation Count</p>
              <p className="text-xs text-muted-foreground mt-1">
                Flagged when a user creates more than 50 generations in a single day
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="font-medium text-sm">Large Deck Size</p>
              <p className="text-xs text-muted-foreground mt-1">
                Flagged when a presentation exceeds 100 slides
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="font-medium text-sm">Suspicious Patterns</p>
              <p className="text-xs text-muted-foreground mt-1">
                Automated detection of abnormal usage patterns
              </p>
            </div>
          </div>
        </div>

        {/* Flagged Table */}
        <div className="bg-card rounded-lg border p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold">Flagged Presentations</h2>
            <p className="text-sm text-muted-foreground">
              {flagged.length} presentations flagged
            </p>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="text-red-500 p-4">{error}</div>
          ) : flagged.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium">No flagged presentations</p>
              <p className="text-sm mt-1">All presentations are within normal parameters</p>
            </div>
          ) : (
            <DataTable data={flagged} columns={columns} pageSize={20} />
          )}
        </div>
      </div>
    </div>
  )
}
