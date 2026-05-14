'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import TextareaAutosize from 'react-textarea-autosize'

import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Pencil
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { safeCopyTextToClipboard } from '@/lib/utils/copy-to-clipboard'

import { Button } from './ui/button'
import { CollapsibleMessage } from './collapsible-message'

interface UserTextSectionProps {
  content: string
  messageId?: string
  onUpdateMessage?: (messageId: string, newContent: string) => Promise<void>
}

function getVisibleUserContent(content: string) {
  const uploadedFiles: string[] = []
  const visibleContent = content
    .replace(
      /<uploaded_file\s+name=(["'])(.*?)\1[^>]*>[\s\S]*?<\/uploaded_file>/gi,
      (_match, _quote, filename) => {
        if (typeof filename === 'string' && filename.trim()) {
          uploadedFiles.push(filename.trim())
        }
        return ''
      }
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { visibleContent, uploadedFiles }
}

export const UserTextSection: React.FC<UserTextSectionProps> = ({
  content,
  messageId,
  onUpdateMessage
}) => {
  const { visibleContent, uploadedFiles } = useMemo(
    () => getVisibleUserContent(content),
    [content]
  )
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState(visibleContent)
  const [isComposing, setIsComposing] = useState(false)
  const [enterDisabled, setEnterDisabled] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isClamped, setIsClamped] = useState(false)
  const enterResetTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const contentRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      setIsClamped(node.scrollHeight > node.clientHeight)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (enterResetTimeoutRef.current) {
        clearTimeout(enterResetTimeoutRef.current)
      }
    }
  }, [])

  const handleCopyClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const copyContent =
      visibleContent ||
      uploadedFiles.map(filename => `Attached file: ${filename}`).join('\n')
    const copiedToClipboard = await safeCopyTextToClipboard(copyContent)
    if (copiedToClipboard) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      return
    }
    // Clipboard access denied — silently ignore
  }

  const handleEditClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    setEditedContent(visibleContent)
    setIsEditing(true)
  }

  const handleCancelClick = () => {
    setIsEditing(false)
  }

  const handleSaveClick = async () => {
    if (!onUpdateMessage || !messageId) return

    setIsEditing(false)

    try {
      await onUpdateMessage(messageId, editedContent)
    } catch (error) {
      console.error('Failed to save message:', error)
    }
  }

  const handleTextareaKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (event.key !== 'Enter') {
      return
    }

    if (event.shiftKey || isComposing || enterDisabled) {
      return
    }

    event.preventDefault()
    void handleSaveClick()
  }

  const handleCompositionStart = () => {
    setIsComposing(true)
  }

  const handleCompositionEnd = () => {
    setIsComposing(false)
    setEnterDisabled(true)
    if (enterResetTimeoutRef.current) {
      clearTimeout(enterResetTimeoutRef.current)
    }
    enterResetTimeoutRef.current = setTimeout(() => {
      setEnterDisabled(false)
      enterResetTimeoutRef.current = null
    }, 300)
  }

  if (!visibleContent && uploadedFiles.length === 0) {
    return null
  }

  return (
    <CollapsibleMessage role="user">
      <div
        className="flex-1 break-words w-full group outline-hidden relative"
        tabIndex={0}
      >
        {isEditing ? (
          <div className="flex flex-col gap-2">
            <TextareaAutosize
              value={editedContent}
              onChange={e => setEditedContent(e.target.value)}
              autoFocus
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              onKeyDown={handleTextareaKeyDown}
              className="resize-none flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
              minRows={2}
              maxRows={10}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={handleCancelClick}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveClick}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="relative">
            {visibleContent ? (
              <div
                ref={contentRef}
                className={cn(
                  'whitespace-pre-wrap',
                  !isExpanded && 'line-clamp-3'
                )}
              >
                {visibleContent}
              </div>
            ) : null}
            {uploadedFiles.length > 0 ? (
              <div
                className={cn('flex flex-wrap gap-2', visibleContent && 'mt-2')}
              >
                {uploadedFiles.map(filename => (
                  <div
                    key={filename}
                    className="inline-flex max-w-full items-center gap-2 rounded-md border border-border/70 bg-muted/40 px-2.5 py-1.5 text-sm text-muted-foreground"
                  >
                    <FileText className="size-4 shrink-0" />
                    <span className="truncate">{filename}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {visibleContent && (isClamped || isExpanded) && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground mt-1"
                onClick={() => setIsExpanded(prev => !prev)}
              >
                {isExpanded ? (
                  <span className="inline-flex items-center gap-0.5">
                    Show less <ChevronUp className="size-3" />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5">
                    Show more <ChevronDown className="size-3" />
                  </span>
                )}
              </button>
            )}
            <div
              className={cn(
                'absolute -top-1 -right-1 flex items-center gap-0.5 p-0.5 transition-opacity bg-background rounded-full shadow-sm border',
                'opacity-0',
                'max-md:group-focus-within:opacity-100',
                'md:group-hover:opacity-100'
              )}
            >
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full size-7"
                onMouseDown={e => e.preventDefault()}
                onClick={handleCopyClick}
              >
                {copied ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full size-7"
                onMouseDown={e => e.preventDefault()}
                onClick={handleEditClick}
                disabled={!visibleContent}
              >
                <Pencil className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </CollapsibleMessage>
  )
}
