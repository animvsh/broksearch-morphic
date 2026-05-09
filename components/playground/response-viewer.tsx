'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export function ResponseViewer({
  response,
  error,
}: {
  response: { content: string; usage?: any; done: boolean } | null;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
        <p className="font-semibold">Error</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="text-muted-foreground text-center py-8">
        <p>Run a request to see the response here</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <div className="whitespace-pre-wrap">{response.content}</div>
      </div>

      {response.done && response.usage && (
        <div className="pt-4 border-t">
          <div className="flex gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Prompt Tokens:</span>{' '}
              {response.usage.prompt_tokens}
            </div>
            <div>
              <span className="text-muted-foreground">Completion Tokens:</span>{' '}
              {response.usage.completion_tokens}
            </div>
            <div>
              <span className="text-muted-foreground">Total Tokens:</span>{' '}
              {response.usage.total_tokens}
            </div>
          </div>
        </div>
      )}

      {!response.done && (
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 bg-primary rounded-full animate-pulse" />
          <span className="text-sm text-muted-foreground">Streaming...</span>
        </div>
      )}
    </div>
  );
}
