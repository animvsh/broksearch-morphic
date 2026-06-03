'use client'

import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

type ProjectRow = {
  id: string
  type: string
  typeLabel: string
  name: string
  owner: string
  ownerId: string
  workspace: string
  status: string
  costUsd: number
  createdAt: Date | string
  lastUpdatedAt: Date | string
  visibility: 'public' | 'private' | 'unlisted'
  resource: string
}

const TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'search_thread', label: 'Search Thread' },
  { value: 'app_project', label: 'App Project' },
  { value: 'presentation_deck', label: 'Presentation Deck' },
  { value: 'api_playground_session', label: 'API Playground Session' },
  { value: 'shared_link', label: 'Shared Link' },
  { value: 'exported_file', label: 'Exported File' }
]

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value > 10 ? 2 : 4,
    maximumFractionDigits: value > 10 ? 2 : 4
  }).format(value)
}

function formatDateTime(value: Date | string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

function visibilityVariant(visibility: string) {
  if (visibility === 'public') return 'default' as const
  if (visibility === 'unlisted') return 'secondary' as const
  return 'outline' as const
}

export function AllProjectsTable({ rows }: { rows: ProjectRow[] }) {
  const [type, setType] = useState<string>('all')
  const [visibility, setVisibility] = useState<string>('all')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const lowered = query.trim().toLowerCase()
    return rows.filter(row => {
      if (type !== 'all' && row.type !== type) return false
      if (visibility !== 'all' && row.visibility !== visibility) return false
      if (lowered) {
        const haystack = `${row.name} ${row.owner} ${row.workspace} ${row.id}`
        if (!haystack.toLowerCase().includes(lowered)) return false
      }
      return true
    })
  }, [rows, type, visibility, query])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Search
          </label>
          <Input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="name, owner, workspace…"
          />
        </div>
        <div className="w-full space-y-1 sm:w-56">
          <label className="text-xs font-medium text-muted-foreground">
            Type
          </label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full space-y-1 sm:w-44">
          <label className="text-xs font-medium text-muted-foreground">
            Visibility
          </label>
          <Select value={visibility} onValueChange={setVisibility}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="private">Private</SelectItem>
              <SelectItem value="unlisted">Unlisted</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setType('all')
            setVisibility('all')
            setQuery('')
          }}
        >
          Reset
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[1080px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Type</th>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Owner</th>
              <th className="px-3 py-2 text-left font-medium">Workspace</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Cost</th>
              <th className="px-3 py-2 text-left font-medium">Created</th>
              <th className="px-3 py-2 text-left font-medium">Updated</th>
              <th className="px-3 py-2 text-left font-medium">Visibility</th>
              <th className="px-3 py-2 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No projects match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map(row => (
                <tr
                  key={`${row.type}-${row.id}`}
                  className="border-b last:border-0"
                >
                  <td className="px-3 py-2">
                    <Badge variant="outline">{row.typeLabel}</Badge>
                  </td>
                  <td className="max-w-[260px] truncate px-3 py-2 font-medium">
                    {row.name}
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-xs">
                    {row.owner}
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-xs">
                    {row.workspace}
                  </td>
                  <td className="px-3 py-2 text-xs capitalize">
                    {row.status.replace(/_/g, ' ')}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {formatCurrency(row.costUsd)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatDateTime(row.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatDateTime(row.lastUpdatedAt)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={visibilityVariant(row.visibility)}>
                      {row.visibility}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <ProjectActions resource={row.resource} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ProjectActions({ resource }: { resource: string }) {
  const [copied, setCopied] = useState(false)
  const target = resource.split(':')[1] ?? resource

  async function copy() {
    try {
      await navigator.clipboard.writeText(target)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"
      >
        {copied ? 'Copied' : 'Copy ID'}
      </button>
      <span className="font-mono text-[10px] text-muted-foreground">
        {target.slice(0, 12)}
        {target.length > 12 ? '…' : ''}
      </span>
    </div>
  )
}
