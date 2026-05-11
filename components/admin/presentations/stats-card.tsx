'use client'

import { cn } from '@/lib/utils'

interface StatsCardProps {
  label: string
  value: string | number
  trend?: {
    value: number
    positive: boolean
  }
  className?: string
}

export function StatsCard({ label, value, trend, className }: StatsCardProps) {
  return (
    <div className={cn('rounded-lg border bg-card p-6 shadow-xs', className)}>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-3xl font-bold text-foreground">{value}</p>
        {trend && (
          <span
            className={cn(
              'text-sm font-medium',
              trend.positive ? 'text-green-600' : 'text-red-600'
            )}
          >
            {trend.positive ? '+' : ''}
            {trend.value}%
          </span>
        )}
      </div>
    </div>
  )
}
