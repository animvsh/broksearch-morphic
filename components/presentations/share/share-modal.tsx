'use client'

import { useEffect, useState } from 'react'

import { Check, Copy, Globe, Lock, Users, X } from 'lucide-react'
import { toast } from 'sonner'

interface ShareModalProps {
  presentationId: string
  shareId?: string
  isPublic?: boolean
  onClose: () => void
  onShareComplete?: (shareId: string, shareUrl: string) => void
}

type ShareMode = 'private' | 'view' | 'duplicate'

interface PresentationShare {
  shareId: string
  shareUrl: string
  isPublic: boolean
}

export function ShareModal({
  presentationId,
  shareId: initialShareId,
  isPublic: initialIsPublic = false,
  onClose,
  onShareComplete
}: ShareModalProps) {
  const [shareMode, setShareMode] = useState<ShareMode>(
    initialIsPublic ? 'view' : 'private'
  )
  const [shareUrl, setShareUrl] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [shareData, setShareData] = useState<PresentationShare | null>(null)

  useEffect(() => {
    // If we already have share info, build the URL
    if (initialShareId) {
      const baseUrl = window.location.origin
      setShareUrl(`${baseUrl}/presentations/${presentationId}/present`)
    }
  }, [initialShareId, presentationId])

  const handleModeChange = async (mode: ShareMode) => {
    setShareMode(mode)
    setIsLoading(true)

    try {
      const isPublic = mode !== 'private'

      const response = await fetch(
        `/api/presentations/${presentationId}/share`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ is_public: isPublic })
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update share settings')
      }

      const data = await response.json()

      setShareData({
        shareId: data.share_id,
        shareUrl: data.share_url,
        isPublic: data.is_public
      })

      setShareUrl(data.share_url)
      toast.success(
        mode === 'private' ? 'Link sharing disabled' : 'Link sharing enabled'
      )

      onShareComplete?.(data.share_id, data.share_url)
    } catch (error) {
      console.error('Share error:', error)
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to update share settings'
      )
      // Revert mode on error
      setShareMode(initialIsPublic ? 'view' : 'private')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setIsCopied(true)
      toast.success('Link copied to clipboard')
      setTimeout(() => setIsCopied(false), 2000)
    } catch {
      toast.error('Failed to copy link')
    }
  }

  const shareOptions = [
    {
      id: 'private' as const,
      label: 'Private',
      description: 'Only you can access',
      icon: Lock
    },
    {
      id: 'view' as const,
      label: 'Anyone with link',
      description: 'Can view the presentation',
      icon: Globe
    },
    {
      id: 'duplicate' as const,
      label: 'Anyone with link',
      description: 'Can duplicate and edit',
      icon: Users
    }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Share Presentation
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4">
            {/* Share Options */}
            <div className="mb-6">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Options
              </p>
              <div className="space-y-2">
                {shareOptions.map(option => (
                  <label
                    key={option.id}
                    className={`
                      flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all
                      ${
                        shareMode === option.id
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }
                    `}
                  >
                    <input
                      type="radio"
                      name="share-mode"
                      value={option.id}
                      checked={shareMode === option.id}
                      onChange={() => handleModeChange(option.id)}
                      disabled={isLoading}
                      className="sr-only"
                    />
                    <div
                      className={`
                        w-5 h-5 rounded-full border-2 flex items-center justify-center
                        ${
                          shareMode === option.id
                            ? 'border-indigo-500'
                            : 'border-gray-300 dark:border-gray-600'
                        }
                      `}
                    >
                      {shareMode === option.id && (
                        <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                      )}
                    </div>
                    <option.icon
                      className={`
                        w-5 h-5
                        ${shareMode === option.id ? 'text-indigo-500' : 'text-gray-400'}
                      `}
                    />
                    <div>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {option.label}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                        {option.description}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Share Link (only show when not private) */}
            {shareMode !== 'private' && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  Share Link
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white truncate"
                  />
                  <button
                    onClick={handleCopyLink}
                    className={`
                      flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-all
                      ${
                        isCopied
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                      }
                    `}
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-4 h-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
