'use client'

import { useMemo, useState } from 'react'

import { Copy, RotateCcw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { humanizeText } from '@/lib/tools/humanizer'
import { safeCopyTextToClipboard } from '@/lib/utils/copy-to-clipboard'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

const starterText =
  "Great question! AI-assisted coding serves as an enduring testament to the transformative potential of large language models, marking a pivotal moment in today's rapidly evolving technological landscape. It's not just about autocomplete; it's about unlocking creativity at scale. I hope this helps!"

export function AiHumanizerTool() {
  const [input, setInput] = useState(starterText)
  const [voiceSample, setVoiceSample] = useState('')

  const result = useMemo(
    () => humanizeText(input, voiceSample),
    [input, voiceSample]
  )

  async function copyOutput() {
    const copied = await safeCopyTextToClipboard(result.output)
    if (copied) {
      toast.success('Humanized text copied')
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Input</CardTitle>
          <CardDescription>
            Paste AI-sounding text and optionally add a writing sample.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={input}
            onChange={event => setInput(event.target.value)}
            className="min-h-64 resize-y leading-6"
            placeholder="Paste text to humanize..."
          />
          <Textarea
            value={voiceSample}
            onChange={event => setVoiceSample(event.target.value)}
            className="min-h-28 resize-y leading-6"
            placeholder="Optional voice sample..."
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                setInput(starterText)
                setVoiceSample('')
              }}
            >
              <RotateCcw className="size-4" />
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Humanized Output</CardTitle>
              <CardDescription>
                Cleaner prose with common AI artifacts removed.
              </CardDescription>
            </div>
            <Button size="sm" className="gap-2" onClick={copyOutput}>
              <Copy className="size-4" />
              Copy
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="min-h-64 whitespace-pre-wrap rounded-lg border border-border/70 bg-muted/25 p-4 text-sm leading-6">
            {result.output || 'Humanized text will appear here.'}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4" />
              Detected patterns
            </div>
            <div className="flex flex-wrap gap-2">
              {result.detectedPatterns.length ? (
                result.detectedPatterns.map(pattern => (
                  <Badge key={pattern} variant="secondary">
                    {pattern}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">
                  No obvious AI-writing markers detected.
                </span>
              )}
            </div>
          </div>
          {result.changes.length ? (
            <div className="rounded-lg border border-border/70 bg-background/70 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Changes made
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {result.changes.map(change => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
