'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { Column,DataTable } from '@/components/admin/presentations/data-table'

interface Deck {
  id: string
  title: string
  user_id: string
  status: string
  slide_count: number
  theme_id: string | null
  created_at: string
  updated_at: string
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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    generating: 'bg-yellow-100 text-yellow-800',
    outline_generating: 'bg-blue-100 text-blue-800',
    slides_generating: 'bg-blue-100 text-blue-800',
    ready: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800'
  }
  const label = status.replace(/_/g, ' ')
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
        styles[status] || 'bg-gray-100 text-gray-800'
      }`}
    >
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </span>
  )
}

export default function DecksPage() {
  const [decks, setDecks] = useState<Deck[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    fetchDecks()
  }, [page, search, statusFilter])

  const fetchDecks = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        type: 'decks',
        page: String(page),
        limit: '20'
      })
      if (search) params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)

      const res = await fetch(`/api/admin/presentations?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setDecks(data.decks || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const columns: Column<Deck>[] = [
    {
      key: 'title',
      label: 'Presentation',
      sortable: true,
      render: (row) => (
        <Link
          href={`/presentations/${row.id}/editor`}
          className="font-medium text-primary hover:underline"
        >
          {row.title.length > 40 ? row.title.slice(0, 40) + '...' : row.title}
        </Link>
      )
    },
    {
      key: 'user_id',
      label: 'Owner',
      sortable: true,
      render: (row) => (
        <span className="text-muted-foreground font-mono text-xs">
          {row.user_id.slice(0, 8)}...
        </span>
      )
    },
    {
      key: 'slide_count',
      label: 'Slides',
      sortable: true,
      render: (row) => <span>{row.slide_count}</span>
    },
    {
      key: 'theme_id',
      label: 'Theme',
      render: (row) => (
        <span className="text-muted-foreground">
          {row.theme_id || 'Default'}
        </span>
      )
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => <StatusBadge status={row.status} />
    },
    {
      key: 'created_at',
      label: 'Created',
      sortable: true,
      render: (row) => (
        <span className="text-muted-foreground text-xs">
          {formatRelativeTime(row.created_at)}
        </span>
      )
    },
    {
      key: 'updated_at',
      label: 'Last Edited',
      sortable: true,
      render: (row) => (
        <span className="text-muted-foreground text-xs">
          {formatRelativeTime(row.updated_at)}
        </span>
      )
    },
    {
      key: 'exports',
      label: 'Exports',
      render: () => <span className="text-muted-foreground">0</span>
    },
    {
      key: 'cost',
      label: 'Cost',
      render: () => <span className="text-muted-foreground">$0.00</span>
    }
  ]

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Presentation Decks</h1>
          <p className="text-muted-foreground mt-1">
            Manage and monitor all presentation decks
          </p>
        </div>

        <div className="bg-card rounded-lg border p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold">All Decks</h2>
              <p className="text-sm text-muted-foreground">{total} total decks</p>
            </div>
            <div className="flex gap-2">
              <select
                className="border rounded-md px-3 py-2 text-sm bg-background"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">All Status</option>
                <option value="draft">Draft</option>
                <option value="ready">Ready</option>
                <option value="error">Error</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <DataTable
              data={decks}
              columns={columns}
              pageSize={20}
              searchPlaceholder="Search by title..."
              onSearch={(q) => {
                setSearch(q)
                setPage(1)
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
