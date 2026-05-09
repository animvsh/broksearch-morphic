'use client'

import { useState } from 'react'

import { Download, FileSpreadsheet,FileText, Image, X } from 'lucide-react'
import { toast } from 'sonner'

interface ExportModalProps {
  presentationId: string
  presentationTitle: string
  onClose: () => void
  onExportComplete?: (url: string) => void
}

type ExportFormat = 'pptx' | 'pdf' | 'images'

export function ExportModal({
  presentationId,
  presentationTitle,
  onClose,
  onExportComplete
}: ExportModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pptx')
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    setIsExporting(true)

    try {
      const response = await fetch(`/api/presentations/${presentationId}/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ format: selectedFormat })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Export failed')
      }

      // For PPTX, the response is a binary buffer that we need to download
      if (selectedFormat === 'pptx') {
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${presentationTitle.replace(/[^a-z0-9]/gi, '_')}.pptx`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        toast.success('Presentation exported successfully')
        onExportComplete?.(url)
      } else {
        // For PDF and images, expect a JSON response with file URL
        const data = await response.json()
        if (data.file_url) {
          window.open(data.file_url, '_blank')
          toast.success('Export started')
          onExportComplete?.(data.file_url)
        }
      }

      onClose()
    } catch (error) {
      console.error('Export error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to export presentation')
    } finally {
      setIsExporting(false)
    }
  }

  const formatOptions = [
    {
      id: 'pptx' as const,
      label: 'PowerPoint (.pptx)',
      description: 'Best for editing and presentations',
      icon: FileSpreadsheet,
      recommended: true
    },
    {
      id: 'pdf' as const,
      label: 'PDF',
      description: 'Best for printing and sharing',
      icon: FileText,
      recommended: false
    },
    {
      id: 'images' as const,
      label: 'Images (.png)',
      description: 'Individual slide images',
      icon: Image,
      recommended: false
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
              Export Presentation
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
            {/* Title */}
            <div className="mb-6">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Title</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {presentationTitle}
              </p>
            </div>

            {/* Format Selection */}
            <div className="mb-6">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Format</p>
              <div className="space-y-2">
                {formatOptions.map(option => (
                  <label
                    key={option.id}
                    className={`
                      flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all
                      ${
                        selectedFormat === option.id
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }
                    `}
                  >
                    <input
                      type="radio"
                      name="export-format"
                      value={option.id}
                      checked={selectedFormat === option.id}
                      onChange={() => setSelectedFormat(option.id)}
                      className="sr-only"
                    />
                    <div
                      className={`
                        w-5 h-5 rounded-full border-2 flex items-center justify-center
                        ${
                          selectedFormat === option.id
                            ? 'border-indigo-500'
                            : 'border-gray-300 dark:border-gray-600'
                        }
                      `}
                    >
                      {selectedFormat === option.id && (
                        <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                      )}
                    </div>
                    <option.icon
                      className={`
                        w-5 h-5
                        ${selectedFormat === option.id ? 'text-indigo-500' : 'text-gray-400'}
                      `}
                    />
                    <div className="flex-1">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {option.label}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                        {option.description}
                      </span>
                    </div>
                    {option.recommended && (
                      <span className="px-2 py-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/50 rounded-full">
                        recommended
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              disabled={isExporting}
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-lg transition-colors"
            >
              {isExporting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Export
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
