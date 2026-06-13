'use client'

import { createContext, ReactNode, useContext } from 'react'

import type { SearchResultItem } from '@/lib/types'

interface CitationContextValue {
  citationMaps?: Record<string, Record<number, SearchResultItem>>
  onCitationOpen?: (citation: SearchResultItem) => void
}

const CitationContext = createContext<CitationContextValue | undefined>(
  undefined
)

export function CitationProvider({
  children,
  citationMaps,
  onCitationOpen
}: {
  children: ReactNode
  citationMaps?: Record<string, Record<number, SearchResultItem>>
  onCitationOpen?: (citation: SearchResultItem) => void
}) {
  return (
    <CitationContext.Provider value={{ citationMaps, onCitationOpen }}>
      {children}
    </CitationContext.Provider>
  )
}

export function useCitation() {
  const context = useContext(CitationContext)
  return context || { citationMaps: undefined, onCitationOpen: undefined }
}
