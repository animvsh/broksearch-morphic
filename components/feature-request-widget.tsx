'use client'

import { useState, useTransition } from 'react'

import { CheckCircle2, HelpCircle, Send, X } from 'lucide-react'
import { toast } from 'sonner'

import { submitFeatureRequest } from '@/lib/actions/feature-requests'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function FeatureRequestWidget() {
  const [open, setOpen] = useState(false)
  const [request, setRequest] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isPending, startTransition] = useTransition()

  function submit() {
    const trimmed = request.trim()
    if (trimmed.length < 3) {
      toast.error('Add a little more detail first.')
      return
    }

    startTransition(async () => {
      const result = await submitFeatureRequest({
        request: trimmed,
        pageUrl: window.location.href
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      setSubmitted(true)
      setRequest('')
      toast.success('Feature request sent')
      window.setTimeout(() => {
        setSubmitted(false)
        setOpen(false)
      }, 1300)
    })
  }

  return (
    <aside
      className={cn(
        'group fixed bottom-4 right-4 z-[90] transition-all duration-300 ease-out',
        open ? 'w-[min(calc(100vw-2rem),340px)]' : 'w-11 hover:w-36'
      )}
      aria-label="Feature request"
    >
      {open ? (
        <div className="overflow-hidden rounded-lg border border-zinc-200/80 bg-white/96 shadow-[0_22px_70px_-50px_rgba(24,24,27,0.5)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-white">
                <HelpCircle className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">Features?</p>
                <p className="truncate text-xs text-muted-foreground">
                  Tell us what to build next.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 rounded-md"
              onClick={() => setOpen(false)}
              aria-label="Collapse feature request widget"
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>

          <div className="p-3">
            {submitted ? (
              <div className="flex min-h-28 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 px-4 text-center text-sm text-emerald-900">
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  Request saved for the team.
                </span>
              </div>
            ) : (
              <>
                <Textarea
                  value={request}
                  onChange={event => setRequest(event.target.value)}
                  placeholder="What should Brok do better?"
                  className="min-h-24 resize-none rounded-lg border-zinc-200 bg-zinc-50/70 focus-visible:ring-zinc-300"
                  maxLength={4000}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="truncate text-[11px] text-muted-foreground">
                    We attach your account when you are signed in.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 shrink-0 gap-2 rounded-lg"
                    onClick={submit}
                    disabled={isPending || request.trim().length < 3}
                  >
                    <Send className="size-3.5" aria-hidden="true" />
                    {isPending ? 'Sending' : 'Send'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="flex h-11 w-full items-center gap-2 overflow-hidden rounded-lg border border-zinc-200/80 bg-white/95 px-3 text-sm font-medium text-zinc-950 shadow-[0_16px_54px_-42px_rgba(24,24,27,0.52)] backdrop-blur transition-all duration-200 hover:border-zinc-300 hover:bg-white"
          onClick={() => setOpen(true)}
          aria-label="Open feature request widget"
        >
          <HelpCircle className="size-5 shrink-0" aria-hidden="true" />
          <span className="whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            Features
          </span>
        </button>
      )}
    </aside>
  )
}
