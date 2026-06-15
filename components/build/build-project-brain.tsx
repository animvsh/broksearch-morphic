'use client'

import { useState } from 'react'

import {
  Boxes,
  FileCode2,
  FolderTree,
  ListChecks,
  ServerCog,
  TerminalSquare
} from 'lucide-react'

import type {
  BrokBuildBackendStatus,
  BrokBuildFilePreview,
  BrokBuildPhase,
  BrokStreamEvent,
  InternalPlan,
  UserVisiblePlan
} from '@/lib/build/types'
import { PHASE_LABELS } from '@/lib/build/types'
import { cn } from '@/lib/utils'

import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type BrainProps = {
  phase: BrokBuildPhase
  plan: UserVisiblePlan | null
  internalPlan: InternalPlan | null
  files: BrokBuildFilePreview[]
  logs: Array<{ time: string; level: 'info' | 'warn' | 'error'; message: string }>
  backendStatus: BrokBuildBackendStatus
  opencodeSessionId: string | null
  events: BrokStreamEvent[]
}

export function BuildProjectBrain({
  phase,
  plan,
  internalPlan,
  files,
  logs,
  backendStatus,
  events
}: BrainProps) {
  const [tab, setTab] = useState('brain')

  return (
    <section className="flex h-full min-h-0 flex-col border-l border-border/60 bg-background">
      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex h-full min-h-0 flex-col"
      >
        <div className="flex h-9 items-center justify-between border-b border-border/60 px-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <span>Project Brain</span>
          <TabsList className="h-7 bg-transparent p-0">
            <TabTrigger value="brain" icon={<ListChecks className="h-3 w-3" />} label="Brain" active={tab === 'brain'} />
            <TabTrigger value="files" icon={<FileCode2 className="h-3 w-3" />} label="Files" active={tab === 'files'} />
            <TabTrigger value="backend" icon={<ServerCog className="h-3 w-3" />} label="Preview" active={tab === 'backend'} />
            <TabTrigger value="logs" icon={<TerminalSquare className="h-3 w-3" />} label="Logs" active={tab === 'logs'} />
          </TabsList>
        </div>

        <TabsContent
          value="brain"
          className="mt-0 flex-1 min-h-0 overflow-y-auto p-3"
          forceMount={tab === 'brain' ? true : undefined}
          hidden={tab !== 'brain'}
        >
          <BrainTab
            plan={plan}
            internalPlan={internalPlan}
            phase={phase}
          />
        </TabsContent>

        <TabsContent
          value="files"
          className="mt-0 flex-1 min-h-0 overflow-y-auto p-3"
          hidden={tab !== 'files'}
        >
          <FilesTab files={files} />
        </TabsContent>

        <TabsContent
          value="backend"
          className="mt-0 flex-1 min-h-0 overflow-y-auto p-3"
          hidden={tab !== 'backend'}
        >
          <BackendTab internalPlan={internalPlan} status={backendStatus} />
        </TabsContent>

        <TabsContent
          value="logs"
          className="mt-0 flex-1 min-h-0 overflow-y-auto p-3"
          hidden={tab !== 'logs'}
        >
          <LogsTab logs={logs} events={events} />
        </TabsContent>
      </Tabs>
    </section>
  )
}

function TabTrigger({
  value,
  icon,
  label,
  active
}: {
  value: string
  icon: React.ReactNode
  label: string
  active: boolean
}) {
  return (
    <TabsTrigger
      value={value}
      className={cn(
        'h-7 rounded-md px-2 text-[10px] uppercase tracking-[0.18em] data-[state=active]:bg-foreground/5 data-[state=active]:text-foreground'
      )}
    >
      <span className="inline-flex items-center gap-1">
        {icon} {label}
      </span>
    </TabsTrigger>
  )
}

function BrainTab({
  plan,
  internalPlan,
  phase
}: {
  plan: UserVisiblePlan | null
  internalPlan: InternalPlan | null
  phase: BrokBuildPhase
}) {
  if (!plan || !internalPlan) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Brok is still planning this app...
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <Section title="Product">
        <p className="font-medium text-foreground">{plan.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{plan.audience}</p>
      </Section>

      <Section title="Core experience">
        <p className="text-xs text-foreground/80">{plan.oneLiner}</p>
      </Section>

      <Section title="Design direction">
        <p className="text-xs text-foreground/80">{plan.designDirection}</p>
      </Section>

      {plan.aiFeatures.length > 0 ? (
        <Section title="AI features">
          <ul className="space-y-1 text-xs text-foreground/80">
            {plan.aiFeatures.map(f => (
              <li key={f} className="flex items-start gap-1.5">
                <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-foreground/40" />
                {f}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Pages">
        <ul className="space-y-1 text-xs text-foreground/80">
          {internalPlan.pages.map(page => (
            <li key={page} className="flex items-center gap-1.5">
              <FolderTree className="h-3 w-3 text-muted-foreground" />
              {page}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Stack">
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          <Stack label="Frontend" value={internalPlan.frontend} />
          <Stack label="Backend" value={internalPlan.backend} />
          <Stack label="Hosting" value={internalPlan.hosting} />
          <Stack label="Agent" value={internalPlan.coding_agent} />
        </div>
      </Section>

      <Section title="Live status">
        <ul className="space-y-1 text-xs text-foreground/80">
          <li className="flex items-center gap-2">
            <StatusDot status="active" />
            Phase: {PHASE_LABELS[phase] ?? phase}
          </li>
          <li className="flex items-center gap-2">
            <StatusDot status="active" />
            Scaffold: planned starter files
          </li>
          <li className="flex items-center gap-2">
            <StatusDot status={phase === 'ready' ? 'active' : 'pending'} />
            Managed preview: {phase === 'ready' ? 'ready' : 'pending'}
          </li>
        </ul>
      </Section>
    </div>
  )
}

function Stack({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background p-2">
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-[11px] text-foreground/80">{value}</p>
    </div>
  )
}

function StatusDot({ status }: { status: 'active' | 'pending' }) {
  return (
    <span
      className={cn(
        'inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full',
        status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'
      )}
    />
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </h4>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

function FilesTab({ files }: { files: BrokBuildFilePreview[] }) {
  if (files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No files generated yet.
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      {files.map(file => (
        <div
          key={file.path}
          className="flex items-center justify-between rounded-md border border-border/60 bg-background px-2 py-1.5"
        >
          <div className="flex min-w-0 items-center gap-2">
            <FileCode2 className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            <span className="truncate font-mono text-[11px] text-foreground/80">
              {file.path}
            </span>
          </div>
          <Badge variant="secondary" className="text-[10px] uppercase">
            {file.language ?? 'txt'}
          </Badge>
        </div>
      ))}
    </div>
  )
}

function BackendTab({
  internalPlan,
  status
}: {
  internalPlan: InternalPlan | null
  status: BrokBuildBackendStatus
}) {
  if (!internalPlan) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Waiting on Brok to plan the starter scaffold...
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4 text-sm">
      <Section title="Starter data model">
        <ul className="space-y-1 text-xs text-foreground/80">
          {internalPlan.database_tables.map(table => (
            <li key={table} className="flex items-center gap-1.5">
              <Check />
              {table}
            </li>
          ))}
        </ul>
      </Section>

      {internalPlan.storage_buckets.length > 0 ? (
        <Section title="Storage">
          <ul className="space-y-1 text-xs text-foreground/80">
            {internalPlan.storage_buckets.map(bucket => (
              <li key={bucket} className="flex items-center gap-1.5">
                <Boxes className="h-3 w-3 text-muted-foreground" />
                {bucket}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {internalPlan.functions.length > 0 ? (
        <Section title="Functions">
          <ul className="space-y-1 text-xs text-foreground/80">
            {internalPlan.functions.map(fn => (
              <li key={fn} className="flex items-center gap-1.5">
                <Check />
                {fn}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {internalPlan.models.length > 0 ? (
        <Section title="Models">
          <ul className="space-y-1 text-xs text-foreground/80">
            {internalPlan.models.map(m => (
              <li key={m} className="flex items-center gap-1.5">
                <Check />
                {m}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Auth placeholder">
        <ul className="space-y-1 text-xs text-foreground/80">
          <li className="flex items-center gap-1.5">
            <Check />
            sign-in screen scaffolded for later wiring
          </li>
        </ul>
      </Section>

      <Section title="Preview status">
        <Badge
          variant={status === 'connected' ? 'default' : 'secondary'}
          className="text-[10px] uppercase tracking-[0.18em]"
        >
          managed preview scaffold
        </Badge>
      </Section>
    </div>
  )
}

function Check() {
  return <span className="text-emerald-500">✓</span>
}

function LogsTab({
  logs,
  events
}: {
  logs: Array<{ time: string; level: 'info' | 'warn' | 'error'; message: string }>
  events: BrokStreamEvent[]
}) {
  if (logs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No build activity yet.
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1 font-mono text-[11px] leading-relaxed">
      {logs.map((log, i) => (
        <div
          key={i}
          className={cn(
            'flex gap-2 rounded-md border border-border/60 bg-background px-2 py-1',
            log.level === 'error' && 'border-rose-500/40 text-rose-600 dark:text-rose-400',
            log.level === 'warn' && 'border-amber-500/40 text-amber-600 dark:text-amber-400'
          )}
        >
          <span className="flex-shrink-0 text-muted-foreground/70">
            {new Date(log.time).toLocaleTimeString()}
          </span>
          <span className="uppercase tracking-[0.18em] text-muted-foreground">
            [{log.level}]
          </span>
          <span className="flex-1">{log.message}</span>
        </div>
      ))}
      {events.length > logs.length ? (
        <p className="mt-2 text-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {events.length} total events
        </p>
      ) : null}
    </div>
  )
}
