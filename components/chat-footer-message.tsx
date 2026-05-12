'use client'

import { useMemo } from 'react'

import { DISCLAIMER_TEXT, getTips, shuffle } from '@/lib/footer-tips'

import { useTypewriterCycle } from '@/hooks/use-typewriter-cycle'

function FooterContent() {
  const shuffledTips = useMemo(() => shuffle(getTips()), [])

  // Build items array: disclaimer first, then tip descriptions
  const items = useMemo(
    () => [DISCLAIMER_TEXT, ...shuffledTips.map(t => t.description)],
    [shuffledTips]
  )

  const { currentIndex, charCount, displayText, isIdle } =
    useTypewriterCycle(items)

  if (isIdle && charCount === 0) return null

  // Index 0 = disclaimer, 1+ = tips
  const tipDataIndex = currentIndex - 1
  const isTip = tipDataIndex >= 0 && charCount > 0
  const tip = isTip ? shuffledTips[tipDataIndex] : null

  return (
    <div className="flex items-center gap-2 select-none">
      {tip ? (
        <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground/60">
          <span>Tips:</span>
          <span className="inline-flex items-center gap-0.5">
            {tip.keys.map((key, i) => (
              <kbd
                key={i}
                className="inline-flex items-center justify-center rounded border border-border/50 bg-muted/50 px-1 py-0.5 text-[10px] leading-none text-muted-foreground/70"
              >
                {key}
              </kbd>
            ))}
          </span>
          <span>{displayText}</span>
        </span>
      ) : (
        <span className="font-mono text-xs text-muted-foreground/60">
          {displayText}
        </span>
      )}
    </div>
  )
}

export function ChatFooterMessage({ isLoading }: { isLoading: boolean }) {
  const loadingItems = useMemo(
    () => ['Searching', 'Reading context', 'Writing'],
    []
  )
  const { displayText: loadingText } = useTypewriterCycle(loadingItems, {
    firstDuration: 1100,
    itemDuration: 1200,
    idleDuration: 70,
    charInterval: 18,
    initialDelay: 50,
    erase: false
  })

  if (isLoading) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/75 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur-sm">
        <span className="size-1.5 animate-pulse rounded-full bg-zinc-900 dark:bg-zinc-100" />
        <span className="thinking-text font-medium text-foreground/80">
          {loadingText || 'Thinking'}
        </span>
        <span className="typing-dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </div>
    )
  }

  return <FooterContent />
}
