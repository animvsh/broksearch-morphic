'use client'

import { useRef, useState } from 'react'

import { Paperclip } from 'lucide-react'
import { toast } from 'sonner'

import {
  CHAT_FILE_INPUT_ACCEPT,
  CHAT_MAX_FILES,
  isAcceptedChatFile
} from '@/lib/files/chat-file-utils'
import { cn } from '@/lib/utils'

import { Button } from './ui/button'

export function FileUploadButton({
  onFileSelect
}: {
  onFileSelect: (files: File[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFiles = (files: FileList | null) => {
    if (!files) return

    const fileArray = Array.from(files).slice(0, CHAT_MAX_FILES)

    const validFiles = fileArray.filter(isAcceptedChatFile)
    const rejected = fileArray.filter(file => !isAcceptedChatFile(file))

    if (rejected.length > 0) {
      toast.error(
        'Some files were not accepted: ' +
          rejected.map(file => file.name).join(', ')
      )
    }

    if (validFiles.length > 0) {
      onFileSelect(validFiles)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div
      onDragOver={e => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={cn(
        'relative rounded-full',
        isDragging && 'ring-2 ring-violet-500/35 ring-offset-2'
      )}
      title="Drag and drop or click to upload"
    >
      <input
        ref={inputRef}
        type="file"
        accept={CHAT_FILE_INPUT_ACCEPT}
        hidden
        multiple
        onChange={e => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <Button
        variant="outline"
        size="icon"
        className="size-9 rounded-full border-zinc-200 bg-white text-zinc-600 shadow-xs hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950"
        type="button"
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip size={18} />
      </Button>
    </div>
  )
}
