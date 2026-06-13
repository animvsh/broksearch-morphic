'use client'

import { useEffect, useState } from 'react'

import { ArrowRight, Check, Settings2, Sparkles } from 'lucide-react'

import type { InternalPlan, UserVisiblePlan } from '@/lib/build/types'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'

type PlanCardProps = {
  plan: UserVisiblePlan
  internalPlan: InternalPlan | null
  autoStarted: boolean
  onStart: () => void
  onAdjust: () => void
}

const COUNTDOWN_SECONDS = 5

export function BuildPlanCard({
  plan,
  internalPlan,
  autoStarted,
  onStart,
  onAdjust
}: PlanCardProps) {
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS)

  useEffect(() => {
    setSecondsLeft(COUNTDOWN_SECONDS)
  }, [])

  useEffect(() => {
    if (autoStarted) return
    const interval = setInterval(() => {
      setSecondsLeft(prev => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [autoStarted])

  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-to-b from-foreground/[0.04] to-background p-4">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <Sparkles className="h-3 w-3" /> Plan ready
        </span>
        {internalPlan ? (
          <span className="rounded-md bg-foreground/[0.04] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            {internalPlan.project_type.replace(/_/g, ' ')}
          </span>
        ) : null}
      </div>

      <h3 className="mt-3 text-base font-semibold text-foreground">
        {plan.title}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        {plan.oneLiner}
      </p>

      <ul className="mt-3 space-y-1.5 text-sm text-foreground/90">
        {plan.bullets.map((bullet, i) => (
          <li key={i} className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>

      {plan.aiFeatures.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {plan.aiFeatures.map(feature => (
            <span
              key={feature}
              className="rounded-md bg-foreground/[0.05] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
            >
              {feature}
            </span>
          ))}
        </div>
      ) : null}

      {internalPlan ? (
        <div className="mt-3 grid grid-cols-2 gap-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <Pill label="Frontend" value={internalPlan.frontend} />
          <Pill label="Backend" value={internalPlan.backend} />
          <Pill label="Hosting" value={internalPlan.hosting} />
          <Pill
            label="Tables"
            value={`${internalPlan.database_tables.length} tables`}
          />
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <Button
          type="button"
          onClick={onStart}
          className={cn('flex-1')}
        >
          {autoStarted ? 'Build started' : 'Start building'}
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onAdjust}
          className="gap-1.5"
        >
          <Settings2 className="h-4 w-4" />
          Adjust plan
        </Button>
      </div>

      {!autoStarted ? (
        <p className="mt-2 text-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Auto-starting in {secondsLeft}s
        </p>
      ) : null}
    </div>
  )
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background px-2 py-1">
      <span className="block text-muted-foreground/80">{label}</span>
      <span className="block text-foreground/80 normal-case tracking-normal">
        {value}
      </span>
    </div>
  )
}
