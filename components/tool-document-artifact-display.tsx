'use client'

import { Check, Download, FileText, TriangleAlert } from 'lucide-react'

import type { ToolPart } from '@/lib/types/ai'

import { Badge } from './ui/badge'

type DocumentArtifactOutput = {
  state?: string
  success?: boolean
  title?: string
  summary?: string
  files?: Array<{
    format: string
    filename: string
    url: string
    mediaType: string
    bytes: number
  }>
}

export function ToolDocumentArtifactDisplay({
  tool
}: {
  tool: ToolPart<'documentArtifacts'>
}) {
  const output =
    tool.state === 'output-available'
      ? (tool.output as DocumentArtifactOutput | undefined)
      : undefined

  const isWorking =
    tool.state === 'input-streaming' || tool.state === 'input-available'
  const isError = tool.state === 'output-error' || output?.success === false

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">
            {output?.title || 'Document Artifact'}
          </span>
        </div>
        <Badge variant={isError ? 'destructive' : 'secondary'}>
          {isWorking ? 'Creating' : isError ? 'Failed' : 'Ready'}
        </Badge>
      </div>

      <div className="text-xs text-muted-foreground">
        {isWorking ? (
          <span>Creating document files…</span>
        ) : isError ? (
          <span className="inline-flex items-center gap-1 text-destructive">
            <TriangleAlert className="h-3.5 w-3.5" />
            {tool.errorText || 'Document generation failed'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            {output?.summary || 'Document files created.'}
          </span>
        )}
      </div>

      {output?.files && output.files.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {output.files.map(file => (
            <a
              key={`${file.format}-${file.url}`}
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
            >
              <Download className="h-3.5 w-3.5" />
              {file.format.toUpperCase()}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
