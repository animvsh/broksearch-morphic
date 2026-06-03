'use client'

import { useState } from 'react'

import {
  ExternalLink,
  Loader2,
  Monitor,
  RefreshCcw,
  Smartphone,
  Tablet
} from 'lucide-react'

import type { BrokBuildFilePreview, BrokBuildPhase } from '@/lib/build/types'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'

type PreviewProps = {
  previewUrl: string | null
  phase: BrokBuildPhase
  files: BrokBuildFilePreview[]
}

type DeviceMode = 'desktop' | 'tablet' | 'mobile'

const DEVICE_WIDTHS: Record<DeviceMode, string> = {
  desktop: 'w-full',
  tablet: 'mx-auto w-[760px] max-w-full',
  mobile: 'mx-auto w-[390px] max-w-full'
}

export function BuildPreviewPanel({ previewUrl, phase, files }: PreviewProps) {
  const [device, setDevice] = useState<DeviceMode>('desktop')
  const [reloadKey, setReloadKey] = useState(0)

  return (
    <section className="flex h-full min-h-0 flex-col bg-muted/30">
      <div className="flex h-9 items-center justify-between border-b border-border/60 bg-background px-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <span>Live preview</span>
        <div className="flex items-center gap-1.5">
          <DeviceButton
            active={device === 'desktop'}
            onClick={() => setDevice('desktop')}
            icon={<Monitor className="h-3.5 w-3.5" />}
            label="Desktop"
          />
          <DeviceButton
            active={device === 'tablet'}
            onClick={() => setDevice('tablet')}
            icon={<Tablet className="h-3.5 w-3.5" />}
            label="Tablet"
          />
          <DeviceButton
            active={device === 'mobile'}
            onClick={() => setDevice('mobile')}
            icon={<Smartphone className="h-3.5 w-3.5" />}
            label="Mobile"
          />
          <span className="mx-1 h-3 w-px bg-border" />
          <button
            type="button"
            onClick={() => setReloadKey(k => k + 1)}
            className="rounded p-1 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
            title="Refresh"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
          </button>
          {previewUrl ? (
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded p-1 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
              title="Open in new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      </div>

      <div className="relative flex-1 min-h-0 overflow-hidden bg-muted/40">
        <div
          className={cn(
            'flex h-full flex-col transition-all duration-200',
            DEVICE_WIDTHS[device]
          )}
        >
          <PreviewContent
            previewUrl={previewUrl}
            phase={phase}
            files={files}
            reloadKey={reloadKey}
          />
        </div>
      </div>
    </section>
  )
}

function DeviceButton({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        'rounded p-1 transition',
        active
          ? 'bg-foreground/10 text-foreground'
          : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
      )}
    >
      {icon}
    </button>
  )
}

type ContentProps = {
  previewUrl: string | null
  phase: BrokBuildPhase
  files: BrokBuildFilePreview[]
  reloadKey: number
}

function PreviewContent({ previewUrl, phase, files, reloadKey }: ContentProps) {
  if (previewUrl) {
    return (
      <iframe
        key={reloadKey}
        title="Brok Build preview"
        src={previewUrl}
        className="h-full w-full bg-background"
      />
    )
  }

  if (phase === 'idle') {
    return (
      <EmptyState
        title="Your app preview will appear here."
        subtitle="Type an idea to start building."
      />
    )
  }

  if (phase === 'failed') {
    return (
      <EmptyState
        title="Preview failed to build."
        subtitle="Brok is fixing it. Open the console to view details."
        tone="error"
      />
    )
  }

  return (
    <BuildingPreview phase={phase} files={files} />
  )
}

function EmptyState({
  title,
  subtitle,
  tone
}: {
  title: string
  subtitle: string
  tone?: 'error'
}) {
  return (
    <div
      className={cn(
        'flex h-full flex-col items-center justify-center gap-3 p-8 text-center',
        tone === 'error' ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-full',
          tone === 'error'
            ? 'bg-rose-500/10'
            : 'bg-foreground/[0.04]'
        )}
      >
        {tone === 'error' ? (
          <span className="text-lg">!</span>
        ) : (
          <Loader2 className="h-4 w-4 animate-spin" />
        )}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  )
}

function BuildingPreview({
  phase,
  files
}: {
  phase: BrokBuildPhase
  files: BrokBuildFilePreview[]
}) {
  const visible = files.slice(0, 4)
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto bg-background p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {phase === 'building_preview' ? 'Starting preview...' : 'Generating files'}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visible.map(file => (
          <div
            key={file.path}
            className="rounded-xl border border-border/60 bg-background p-3"
          >
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <span className="truncate font-mono normal-case tracking-normal">
                {file.path}
              </span>
              <span>{Math.round(file.size / 100) / 10}kb</span>
            </div>
            <pre className="mt-2 max-h-32 overflow-hidden text-[10px] leading-relaxed text-foreground/70">
              {file.preview ?? '// generating...'}
            </pre>
          </div>
        ))}
      </div>
      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
          Setting up database, auth, and storage...
        </div>
      ) : null}
    </div>
  )
}
