'use client'

export function ResponseViewer({
  response,
  error
}: {
  response: { content: string; usage?: any; done: boolean } | null
  error: string | null
}) {
  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">
        <p className="font-semibold">Error</p>
        <p className="text-sm">{error}</p>
      </div>
    )
  }

  if (!response) {
    return (
      <div className="flex min-h-[180px] items-center justify-center text-center text-sm text-muted-foreground">
        <p>Run a request to see the response here</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <div className="whitespace-pre-wrap">{response.content}</div>
      </div>

      {response.done && response.usage && (
        <div className="border-t pt-3">
          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
            <div className="rounded-md border bg-muted/20 px-2 py-1.5">
              <span>Prompt</span>{' '}
              <span className="font-medium text-foreground">
              {response.usage.prompt_tokens}
              </span>
            </div>
            <div className="rounded-md border bg-muted/20 px-2 py-1.5">
              <span>Completion</span>{' '}
              <span className="font-medium text-foreground">
              {response.usage.completion_tokens}
              </span>
            </div>
            <div className="rounded-md border bg-muted/20 px-2 py-1.5">
              <span>Total</span>{' '}
              <span className="font-medium text-foreground">
              {response.usage.total_tokens}
              </span>
            </div>
          </div>
        </div>
      )}

      {!response.done && (
        <div className="flex items-center gap-2">
          <div className="size-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm text-muted-foreground">Streaming...</span>
        </div>
      )}
    </div>
  )
}
