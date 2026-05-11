'use client'

import { useState } from 'react'

import { Check, Copy } from 'lucide-react'

import { safeCopyTextToClipboard } from '@/lib/utils/copy-to-clipboard'

import { Button } from '@/components/ui/button'

interface CopyButtonProps {
  content: string
  className?: string
}

export function CopyButton({ content, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const copiedToClipboard = await safeCopyTextToClipboard(content)
    if (copiedToClipboard) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      return
    }
    setCopied(false)
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className={className}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </Button>
  )
}
