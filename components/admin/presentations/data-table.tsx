'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

export interface Column<T> {
  key: string
  label: string
  sortable?: boolean
  render?: (row: T) => React.ReactNode
}

interface DataTableProps<T extends { id: string }> {
  data: T[]
  columns: Column<T>[]
  pageSize?: number
  searchPlaceholder?: string
  filterOptions?: { key: string; label: string; values: string[] }[]
  onSearch?: (query: string) => void
  onFilter?: (filters: Record<string, string>) => void
}

export function DataTable<T extends { id: string }>({
  data,
  columns,
  pageSize = 20,
  searchPlaceholder = 'Search...',
  filterOptions = [],
  onSearch,
  onFilter
}: DataTableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filters, setFilters] = useState<Record<string, string>>({})

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setCurrentPage(1)
    onSearch?.(value)
  }

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    setCurrentPage(1)
    onFilter?.(newFilters)
  }

  const filteredData = data.filter((row) => {
    if (search) {
      const searchLower = search.toLowerCase()
      const matchesSearch = Object.values(row).some((val) =>
        String(val).toLowerCase().includes(searchLower)
      )
      if (!matchesSearch) return false
    }
    for (const [key, value] of Object.entries(filters)) {
      if (value && String(row[key as keyof T]).toLowerCase() !== value.toLowerCase()) {
        return false
      }
    }
    return true
  })

  const sortedData = sortKey
    ? [...filteredData].sort((a, b) => {
        const aVal = a[sortKey as keyof T]
        const bVal = b[sortKey as keyof T]
        const comparison = String(aVal).localeCompare(String(bVal))
        return sortDir === 'asc' ? comparison : -comparison
      })
    : filteredData

  const totalPages = Math.ceil(sortedData.length / pageSize)
  const paginatedData = sortedData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="max-w-sm"
          />
          {filterOptions.map((filter) => (
            <Select
              key={filter.key}
              value={filters[filter.key] || 'all'}
              onValueChange={(value) =>
                handleFilterChange(filter.key, value === 'all' ? '' : value)
              }
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder={filter.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {filter.label}</SelectItem>
                {filter.values.map((val) => (
                  <SelectItem key={val} value={val.toLowerCase()}>
                    {val}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'p-4 text-left text-sm font-medium text-muted-foreground',
                    col.sortable && 'cursor-pointer hover:bg-muted/80'
                  )}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortKey === col.key && (
                      <span className="text-xs">
                        {sortDir === 'asc' ? ' ↑' : ' ↓'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="p-8 text-center text-muted-foreground"
                >
                  No results found
                </td>
              </tr>
            ) : (
              paginatedData.map((row, idx) => (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b',
                    idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="p-4 text-sm">
                      {col.render
                        ? col.render(row)
                        : String(row[col.key as keyof T] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * pageSize + 1} to{' '}
            {Math.min(currentPage * pageSize, sortedData.length)} of{' '}
            {sortedData.length} results
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
