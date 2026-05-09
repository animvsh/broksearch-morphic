'use client'

import { useEffect, useState } from 'react'

import { Column,DataTable } from '@/components/admin/presentations/data-table'

interface Generation {
  id: string
  presentation_id: string
  user_id: string
  prompt: string
  generation_type: string
  model: string
  web_search_enabled: boolean
  input_tokens: number
  output_tokens: number
  cost_usd: number
  status: string
  created_at: string
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
  const isCompleted = status === 'completed'
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
        isCompleted
          ? 'bg-green-100 text-green-800'
          : 'bg-red-100 text-red-800'
      }`}
    >
      {status}
    </span>
  )
}

export default function GenerationsPage() {
  const [generations, setGenerations] = useState<Generation[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchGenerations()
  }, [page])

  const fetchGenerations = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        type: 'generations',
        page: String(page),
        limit: '20'
      })
      const res = await fetch(`/api/admin/presentations?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setGenerations(data.generations || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const columns: Column<Generation>[] = [
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
      key: 'user_id',
      label: 'User',
      sortable: true,
      render: (row) => (
        <span className="font-mono text-xs">{row.user_id.slice(0, 8)}...</span>
      )
    },
    {
      key: 'presentation_id',
      label: 'Presentation',
      render: (row) => (
        <span className="font-mono text-xs">{row.presentation_id.slice(0, 8)}...</span>
      )
    },
    {
      key: 'generation_type',
      label: 'Type',
      sortable: true,
      render: (row) => (
        <span className="capitalize text-sm">{row.generation_type}</span>
      )
    },
    {
      key: 'model',
      label: 'Model',
      render: (row) => <span className="text-sm">{row.model}</span>
    },
    {
      key: 'web_search_enabled',
      label: 'Web Search',
      render: (row) => (
        <span
          className={`text-sm ${row.web_search_enabled ? 'text-green-600' : 'text-muted-foreground'}`}
        >
          {row.web_search_enabled ? 'Yes' : 'No'}
        </span>
      )
    },
    {
      key: 'input_tokens',
      label: 'Input Tokens',
      sortable: true,
      render: (row) => <span className="text-sm">{row.input_tokens.toLocaleString()}</span>
    },
    {
      key: 'output_tokens',
      label: 'Output Tokens',
      sortable: true,
      render: (row) => <span className="text-sm">{row.output_tokens.toLocaleString()}</span>
    },
    {
      key: 'cost_usd',
      label: 'Cost',
      sortable: true,
      render: (row) => (
        <span className="text-sm font-medium">${(row.cost_usd / 100).toFixed(4)}</span>
      )
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => <StatusBadge status={row.status} />
    }
  ]

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Generations Log</h1>
          <p className="text-muted-foreground mt-1">
            Track all presentation generation requests
          </p>
        </div>

        <div className="bg-card rounded-lg border p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold">Generation History</h2>
            <p className="text-sm text-muted-foreground">{total} total generations</p>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <DataTable
              data={generations}
              columns={columns}
              pageSize={20}
            />
          )}
        </div>
      </div>
    </div>
  )
}
