'use client'

import { cn } from '@/lib/utils'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface CostItem {
  label: string
  amount: number
}

interface CostBreakdownProps {
  items: CostItem[]
  className?: string
}

export function CostBreakdown({ items, className }: CostBreakdownProps) {
  const total = items.reduce((sum, item) => sum + item.amount, 0)

  return (
    <Card className={cn('', className)}>
      <CardHeader>
        <CardTitle className="text-base font-medium">Cost Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map(item => (
          <div key={item.label} className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{item.label}</span>
            <span className="text-sm font-medium">
              ${item.amount.toFixed(2)}
            </span>
          </div>
        ))}
        <div className="border-t pt-3 mt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-sm font-bold">${total.toFixed(2)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
