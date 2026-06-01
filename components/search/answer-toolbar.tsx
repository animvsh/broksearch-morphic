'use client'

import { useState } from 'react'

import { Check, Copy, Languages, RotateCcw, Share2, Volume2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface AnswerToolbarProps {
  answerText: string
  onRegenerate?: () => void
  onShare?: () => void
  onReadAloud?: () => void
  onTranslate?: (lang: string) => void
  isRegenerating?: boolean
  className?: string
}

const LANGS: Array<{ code: string; label: string }> = [
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'pt', label: 'Português' },
  { code: 'ar', label: 'العربية' }
]

export function AnswerToolbar({
  answerText,
  onRegenerate,
  onShare,
  onReadAloud,
  onTranslate,
  isRegenerating,
  className
}: AnswerToolbarProps) {
  const [copied, setCopied] = useState(false)
  const [showLangs, setShowLangs] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(answerText)
      setCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Copy failed')
    }
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1 rounded-xl border border-border/60 bg-card/60 p-1 backdrop-blur',
        className
      )}
    >
      <ToolbarButton
        icon={copied ? Check : Copy}
        label={copied ? 'Copied' : 'Copy'}
        onClick={handleCopy}
        success={copied}
      />
      <ToolbarButton
        icon={Share2}
        label="Share"
        onClick={onShare}
      />
      <ToolbarButton
        icon={RotateCcw}
        label="Regenerate"
        onClick={onRegenerate}
        loading={isRegenerating}
      />
      <ToolbarButton
        icon={Volume2}
        label="Read aloud"
        onClick={onReadAloud}
      />
      <div className="relative">
        <ToolbarButton
          icon={Languages}
          label="Translate"
          onClick={() => setShowLangs(v => !v)}
          active={showLangs}
        />
        {showLangs && (
          <div
            className="absolute right-0 top-full z-20 mt-1.5 w-44 overflow-hidden rounded-lg border border-border/60 bg-popover p-1 shadow-lg"
            role="menu"
          >
            {LANGS.map(l => (
              <button
                key={l.code}
                type="button"
                role="menuitem"
                onClick={() => {
                  onTranslate?.(l.code)
                  setShowLangs(false)
                }}
                className="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-sm text-foreground/90 transition-colors hover:bg-foreground/5"
              >
                {l.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface ToolbarButtonProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick?: () => void
  loading?: boolean
  success?: boolean
  active?: boolean
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  loading,
  success,
  active
}: ToolbarButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={loading}
      className={cn(
        'h-8 gap-1.5 rounded-lg px-2.5 text-xs font-medium',
        active && 'bg-foreground/5',
        success && 'text-emerald-600'
      )}
    >
      <Icon
        className={cn(
          'size-3.5',
          loading && 'animate-spin',
          success && 'text-emerald-600'
        )}
      />
      <span>{label}</span>
    </Button>
  )
}
