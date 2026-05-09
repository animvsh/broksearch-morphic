export type PresentationStatus =
  | 'draft'
  | 'generating'
  | 'outline_generating'
  | 'slides_generating'
  | 'ready'
  | 'error'

export type PresentationStyle = 'startup' | 'professional' | 'casual' | 'academic'

export interface Presentation {
  id: string
  userId: string
  workspaceId?: string
  title: string
  description?: string
  status: PresentationStatus
  themeId?: string
  language: string
  style?: PresentationStyle
  slideCount: number
  shareId?: string
  isPublic: boolean
  createdAt: Date
  updatedAt: Date
}

export type FilterTab =
  | 'all'
  | 'recent'
  | 'shared'
  | 'drafts'
  | 'exported'
  | 'pitch_decks'
  | 'class_presentations'

export const FILTER_TAB_LABELS: Record<FilterTab, string> = {
  all: 'All',
  recent: 'Recent',
  shared: 'Shared',
  drafts: 'Drafts',
  exported: 'Exported',
  pitch_decks: 'Pitch Decks',
  class_presentations: 'Class Presentations'
}

export const STATUS_LABELS: Record<PresentationStatus, string> = {
  draft: 'Draft',
  generating: 'Generating',
  outline_generating: 'Outline',
  slides_generating: 'Slides',
  ready: 'Ready',
  error: 'Error'
}
