'use client'

import { useTransition } from 'react'

import { Share } from 'lucide-react'
import { toast } from 'sonner'

import { shareChat } from '@/lib/actions/chat'
import { cn } from '@/lib/utils'
import { safeCopyTextToClipboard } from '@/lib/utils/copy-to-clipboard'

import { Button } from './ui/button'
import { Spinner } from './ui/spinner'

interface ChatShareProps {
  chatId: string
  className?: string
}

export function ChatShare({ chatId, className }: ChatShareProps) {
  const [pending, startTransition] = useTransition()
  const handleShare = () => {
    startTransition(async () => {
      let sharedChatObject: Awaited<ReturnType<typeof shareChat>> = null
      try {
        sharedChatObject = await shareChat(chatId)
      } catch {
        toast.error('Share failed right now. Please try again.')
        return
      }
      if (!sharedChatObject) {
        toast.error(
          'Failed to make chat public. You may need to be logged in or own the chat.'
        )
        return
      }

      const shareUrl = new URL(
        `/search/${sharedChatObject.id}`,
        window.location.origin
      ).toString()

      const copiedToClipboard = await safeCopyTextToClipboard(shareUrl)
      if (copiedToClipboard) {
        toast.success('Share link copied')
        return
      }

      window.open(shareUrl, '_blank', 'noopener,noreferrer')
      toast.success('Opened share link. Copy it from the address bar.')
    })
  }

  return (
    <div className={className}>
      <Button
        className={cn('rounded-full')}
        size="icon"
        variant="ghost"
        onClick={handleShare}
        disabled={pending}
        title="Share chat"
      >
        {pending ? <Spinner /> : <Share size={14} />}
      </Button>
    </div>
  )
}
