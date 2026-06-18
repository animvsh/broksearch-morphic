'use client'

import { useEffect, useState } from 'react'

import {
  Boxes,
  FileCode2,
  FolderTree,
  ListChecks,
  ServerCog,
  TerminalSquare
} from 'lucide-react'

import type {
  BrokBuildBackendResourcePlan,
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
  projectId: string | null
  phase: BrokBuildPhase
  plan: UserVisiblePlan | null
  internalPlan: InternalPlan | null
  backendPlan: BrokBuildBackendResourcePlan | null
  files: BrokBuildFilePreview[]
  logs: Array<{ time: string; level: 'info' | 'warn' | 'error'; message: string }>
  backendStatus: BrokBuildBackendStatus
  opencodeSessionId: string | null
  events: BrokStreamEvent[]
  onFilesUpdated?: (
    files: BrokBuildFilePreview[],
    reason: 'loaded' | 'saved',
    metadata?: FilesUpdateMetadata
  ) => void
}

type EditableProjectFile = BrokBuildFilePreview & {
  content: string
}

export type FilesUpdateMetadata = {
  previewUrl?: string | null
  previewUnavailableReason?: string | null
  projectMessage?: string | null
}

function previewUnavailableMessage(reason: string | null) {
  if (reason === 'missing_renderable_entry') {
    return 'Preview unavailable because this project has no renderable index.html.'
  }
  return reason
}

function extractFilesUpdateMetadata(body: unknown): FilesUpdateMetadata {
  if (!body || typeof body !== 'object') return {}
  const record = body as Record<string, unknown>
  const project =
    record.project && typeof record.project === 'object'
      ? (record.project as Record<string, unknown>)
      : null
  const metadata =
    project?.metadata && typeof project.metadata === 'object'
      ? (project.metadata as Record<string, unknown>)
      : null
  const previewMetadata =
    metadata?.preview && typeof metadata.preview === 'object'
      ? (metadata.preview as Record<string, unknown>)
      : null
  const previewUrl =
    typeof record.previewUrl === 'string'
      ? record.previewUrl
      : record.previewUrl === null
        ? null
        : typeof project?.previewUrl === 'string'
          ? project.previewUrl
          : project && project.previewUrl === null
            ? null
            : undefined
  const unavailableReason =
    typeof previewMetadata?.unavailableReason === 'string'
      ? previewMetadata.unavailableReason
      : null
  const projectMessage = previewUnavailableMessage(unavailableReason)

  return {
    previewUrl,
    previewUnavailableReason: projectMessage,
    projectMessage
  }
}

export function BuildProjectBrain({
  projectId,
  phase,
  plan,
  internalPlan,
  backendPlan,
  files,
  logs,
  backendStatus,
  events,
  onFilesUpdated
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
          <FilesTab
            files={files}
            projectId={projectId}
            onFilesUpdated={onFilesUpdated}
          />
        </TabsContent>

        <TabsContent
          value="backend"
          className="mt-0 flex-1 min-h-0 overflow-y-auto p-3"
          hidden={tab !== 'backend'}
        >
          <BackendTab
            internalPlan={internalPlan}
            backendPlan={backendPlan}
            status={backendStatus}
          />
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

function toFilePreview(file: EditableProjectFile): BrokBuildFilePreview {
  return {
    path: file.path,
    language: file.language,
    size: file.content.length,
    preview: file.content.slice(0, 240)
  }
}

function normalizeApiFiles(files: unknown): EditableProjectFile[] {
  if (!Array.isArray(files)) return []
  return files.flatMap(file => {
    if (
      !file ||
      typeof file !== 'object' ||
      !('path' in file) ||
      typeof file.path !== 'string'
    ) {
      return []
    }
    const content =
      'content' in file && typeof file.content === 'string'
        ? file.content
        : 'preview' in file && typeof file.preview === 'string'
          ? file.preview
          : ''
    const language =
      'language' in file && typeof file.language === 'string'
        ? file.language
        : null
    return [
      {
        path: file.path,
        language,
        size: content.length,
        preview: content.slice(0, 240),
        content
      }
    ]
  })
}

export function FilesTab({
  files,
  projectId,
  onFilesUpdated
}: {
  files: BrokBuildFilePreview[]
  projectId: string | null
  onFilesUpdated?: (
    files: BrokBuildFilePreview[],
    reason: 'loaded' | 'saved',
    metadata?: FilesUpdateMetadata
  ) => void
}) {
  const [projectFiles, setProjectFiles] = useState<EditableProjectFile[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<{
    tone: 'idle' | 'loading' | 'saving' | 'saved' | 'error'
    message: string
  }>({ tone: 'idle', message: '' })

  const selectedFile =
    projectFiles.find(file => file.path === selectedPath) ?? null

  useEffect(() => {
    if (!projectId || files.length === 0 || projectFiles.length > 0) return
    void loadProjectFiles(undefined, 'loaded')
    // loadProjectFiles reads current selection state; keep this effect scoped to
    // the first persisted-file load for a new project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length, projectFiles.length, projectId])

  async function loadProjectFiles(
    pathToSelect?: string,
    reason: 'loaded' | 'saved' = 'loaded'
  ) {
    if (!projectId) return
    setStatus({ tone: 'loading', message: 'Loading project files...' })
    try {
      const response = await fetch(`/api/brokcode/projects/${projectId}/files`)
      const body = (await response.json().catch(() => null)) as {
        files?: unknown
        error?: unknown
      } | null
      if (!response.ok) {
        throw new Error(
          typeof body?.error === 'string'
            ? body.error
            : `Could not load files (${response.status}).`
        )
      }
      const loadedFiles = normalizeApiFiles(body?.files)
      setProjectFiles(loadedFiles)
      onFilesUpdated?.(
        loadedFiles.map(toFilePreview),
        reason,
        extractFilesUpdateMetadata(body)
      )
      const nextSelected =
        pathToSelect ??
        selectedPath ??
        loadedFiles[0]?.path ??
        null
      setSelectedPath(nextSelected)
      const nextFile =
        loadedFiles.find(file => file.path === nextSelected) ?? loadedFiles[0]
      setDraft(nextFile?.content ?? '')
      setStatus({
        tone: 'idle',
        message: loadedFiles.length
          ? ''
          : 'No saved files were found for this project.'
      })
    } catch (error) {
      setStatus({
        tone: 'error',
        message:
          error instanceof Error ? error.message : 'Could not load files.'
      })
    }
  }

  async function saveSelectedFile() {
    if (!projectId || !selectedFile) return
    setStatus({ tone: 'saving', message: `Saving ${selectedFile.path}...` })
    try {
      const response = await fetch(
        `/api/brokcode/projects/${projectId}/files`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: selectedFile.path,
            content: draft,
            language: selectedFile.language
          })
        }
      )
      const body = (await response.json().catch(() => null)) as {
        allFiles?: unknown
        error?: unknown
        files?: unknown
      } | null
      if (!response.ok) {
        throw new Error(
          typeof body?.error === 'string'
            ? body.error
            : `Could not save file (${response.status}).`
        )
      }
      const serverFiles = normalizeApiFiles(body?.allFiles ?? body?.files)
      const updatedFiles =
        serverFiles.length > 0
          ? serverFiles
          : projectFiles.map(file =>
              file.path === selectedFile.path
                ? {
                    ...file,
                    content: draft,
                    size: draft.length,
                    preview: draft.slice(0, 240)
                  }
                : file
            )
      setProjectFiles(updatedFiles)
      const metadata = extractFilesUpdateMetadata(body)
      onFilesUpdated?.(updatedFiles.map(toFilePreview), 'saved', metadata)
      setStatus({
        tone: 'saved',
        message: metadata.previewUnavailableReason
          ? `${selectedFile.path} saved. ${metadata.previewUnavailableReason}`
          : `${selectedFile.path} saved. Recheck preview and publish readiness.`
      })
    } catch (error) {
      setStatus({
        tone: 'error',
        message:
          error instanceof Error ? error.message : 'Could not save file.'
      })
    }
  }

  if (files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No files generated yet.
      </div>
    )
  }
  const visibleFiles = projectFiles.length > 0 ? projectFiles : files
  const canEdit = !!projectId && projectFiles.length > 0 && !!selectedFile

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Project files
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {projectId
              ? 'Load a saved file, edit it, and refresh the managed preview.'
              : 'Start a managed build to edit persisted files.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void loadProjectFiles()
          }}
          disabled={!projectId || status.tone === 'loading'}
          className="rounded-md border border-border/60 bg-background px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] transition hover:border-foreground/30 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          {status.tone === 'loading' ? 'Loading...' : 'Load saved'}
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(220px,1fr)] gap-3">
        <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
          {visibleFiles.map(file => {
            const selected = file.path === selectedPath
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => {
                  if (!projectId || projectFiles.length === 0) {
                    return
                  }
                  setSelectedPath(file.path)
                  setDraft(
                    projectFiles.find(projectFile => projectFile.path === file.path)
                      ?.content ?? ''
                  )
                }}
                className={cn(
                  'flex items-center justify-between rounded-md border px-2 py-1.5 text-left transition',
                  selected
                    ? 'border-foreground/40 bg-foreground/[0.04]'
                    : 'border-border/60 bg-background hover:border-foreground/30'
                )}
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
              </button>
            )
          })}
        </div>

        <div className="flex min-h-0 flex-col rounded-md border border-border/60 bg-background">
          <div className="flex items-center justify-between gap-2 border-b border-border/60 px-2 py-1.5">
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              {selectedFile?.path ?? 'No saved file loaded'}
            </span>
            <button
              type="button"
              onClick={() => {
                void saveSelectedFile()
              }}
              disabled={!canEdit || status.tone === 'saving'}
              className="rounded-md border border-border/60 bg-background px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] transition hover:border-foreground/30 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              {status.tone === 'saving' ? 'Saving...' : 'Save'}
            </button>
          </div>
          <textarea
            value={draft}
            onChange={event => setDraft(event.target.value)}
            disabled={!canEdit}
            spellCheck={false}
            className="min-h-0 flex-1 resize-none bg-transparent p-2 font-mono text-[11px] leading-relaxed outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder={
              projectId
                ? 'Load saved project files to edit them here.'
                : 'Create a managed BrokCode project before editing files.'
            }
          />
        </div>
      </div>

      {status.message ? (
        <p
          role={status.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'text-[11px]',
            status.tone === 'error'
              ? 'text-rose-600 dark:text-rose-400'
              : status.tone === 'saved'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-muted-foreground'
          )}
        >
          {status.message}
        </p>
      ) : null}
    </div>
  )
}

function BackendTab({
  internalPlan,
  backendPlan,
  status
}: {
  internalPlan: InternalPlan | null
  backendPlan: BrokBuildBackendResourcePlan | null
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
      {backendPlan ? (
        <>
          <Section title="InsForge plan">
            <div className="grid grid-cols-3 gap-1.5 text-xs">
              <Stack label="Tables" value={String(backendPlan.tables.length)} />
              <Stack
                label="Storage"
                value={String(backendPlan.storageBuckets.length)}
              />
              <Stack
                label="Functions"
                value={String(backendPlan.functions.length)}
              />
            </div>
          </Section>

          <Section title="Tables">
            <ul className="space-y-1 text-xs text-foreground/80">
              {backendPlan.tables.map(table => (
                <li key={table.name} className="flex items-center gap-1.5">
                  <Check />
                  <span className="font-mono">{table.name}</span>
                  <span className="text-muted-foreground">
                    {table.columns.length} cols
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          {backendPlan.storageBuckets.length > 0 ? (
            <Section title="Storage">
              <ul className="space-y-1 text-xs text-foreground/80">
                {backendPlan.storageBuckets.map(bucket => (
                  <li key={bucket.name} className="flex items-center gap-1.5">
                    <Boxes className="h-3 w-3 text-muted-foreground" />
                    <span className="font-mono">{bucket.name}</span>
                    <span className="text-muted-foreground">
                      {bucket.visibility}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {backendPlan.functions.length > 0 ? (
            <Section title="Functions">
              <ul className="space-y-1 text-xs text-foreground/80">
                {backendPlan.functions.map(fn => (
                  <li key={fn.slug} className="flex items-center gap-1.5">
                    <Check />
                    <span className="font-mono">{fn.slug}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title="Env">
            <div className="flex flex-wrap gap-1">
              {[...backendPlan.publicEnv, ...backendPlan.privateEnv].map(env => (
                <Badge
                  key={env}
                  variant="secondary"
                  className="font-mono text-[10px]"
                >
                  {env}
                </Badge>
              ))}
            </div>
          </Section>

          <Section title="Migration">
            <p className="font-mono text-[11px] text-foreground/80">
              {backendPlan.migrationSql.split('\n').length} SQL lines
            </p>
          </Section>
        </>
      ) : (
        <>
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
        </>
      )}

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
