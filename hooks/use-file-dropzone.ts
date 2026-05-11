import { useCallback, useState } from 'react'

import { toast } from 'sonner'

import {
  CHAT_MAX_FILE_SIZE_BYTES,
  CHAT_MAX_FILES,
  extractTextForChat,
  isAcceptedChatFile,
  isUploadableBinaryFile
} from '@/lib/files/chat-file-utils'
import { UploadedFile } from '@/lib/types'

type UseFileDropzoneProps = {
  uploadedFiles: UploadedFile[]
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>
  maxFiles?: number
  isGuest?: boolean
  chatId: string
}

export function useFileDropzone({
  uploadedFiles,
  setUploadedFiles,
  isGuest = false,
  chatId,
  maxFiles = CHAT_MAX_FILES
}: UseFileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }, [])

  const processFiles = useCallback(
    async (rawFiles: File[]) => {
      const accepted = rawFiles.filter(isAcceptedChatFile)
      const rejected = rawFiles.filter(file => !isAcceptedChatFile(file))

      if (rejected.length > 0) {
        toast.error(
          'Some files were not accepted: ' +
            rejected.map(file => file.name).join(', ')
        )
      }

      const total = uploadedFiles.length + accepted.length
      if (total > maxFiles) {
        toast.error(`You can upload a maximum of ${maxFiles} files.`)
        return
      }

      const initialFiles: UploadedFile[] = accepted.map(file => ({
        file,
        status: 'uploading'
      }))

      setUploadedFiles(prev => [...prev, ...initialFiles].slice(0, maxFiles))

      await Promise.all(
        initialFiles.map(async uploadedFile => {
          if (uploadedFile.file.size > CHAT_MAX_FILE_SIZE_BYTES) {
            toast.error(
              `${uploadedFile.file.name} is too large (max 5MB per file).`
            )
            setUploadedFiles(prev =>
              prev.map(file =>
                file.file === uploadedFile.file
                  ? { ...file, status: 'error' }
                  : file
              )
            )
            return
          }

          try {
            const extractedText = await extractTextForChat(uploadedFile.file)
            if (extractedText) {
              setUploadedFiles(prev =>
                prev.map(file =>
                  file.file === uploadedFile.file
                    ? {
                        ...file,
                        status: 'uploaded',
                        name: uploadedFile.file.name,
                        extractedText,
                        source: 'inline-text'
                      }
                    : file
                )
              )
              return
            }

            if (!isUploadableBinaryFile(uploadedFile.file)) {
              toast.error(`Unsupported file type: ${uploadedFile.file.name}`)
              setUploadedFiles(prev =>
                prev.map(file =>
                  file.file === uploadedFile.file
                    ? { ...file, status: 'error' }
                    : file
                )
              )
              return
            }

            if (isGuest) {
              toast.error(
                `Sign in to upload ${uploadedFile.file.name}. Text files work in guest mode.`
              )
              setUploadedFiles(prev =>
                prev.map(file =>
                  file.file === uploadedFile.file
                    ? { ...file, status: 'error' }
                    : file
                )
              )
              return
            }

            const formData = new FormData()
            formData.append('file', uploadedFile.file)
            formData.append('chatId', chatId)

            const response = await fetch('/api/upload', {
              method: 'POST',
              body: formData
            })

            if (!response.ok) throw new Error('Upload failed')

            const { file } = await response.json()
            setUploadedFiles(prev =>
              prev.map(existing =>
                existing.file === uploadedFile.file
                  ? {
                      ...existing,
                      status: 'uploaded',
                      url: file.url,
                      name: file.filename,
                      key: file.key,
                      source: 'upload'
                    }
                  : existing
              )
            )
          } catch {
            toast.error(`Failed to process ${uploadedFile.file.name}`)
            setUploadedFiles(prev =>
              prev.map(file =>
                file.file === uploadedFile.file
                  ? { ...file, status: 'error' }
                  : file
              )
            )
          }
        })
      )
    },
    [chatId, isGuest, maxFiles, setUploadedFiles, uploadedFiles]
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      await processFiles(Array.from(e.dataTransfer.files))
    },
    [processFiles]
  )

  return {
    isDragging,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    processFiles
  }
}
