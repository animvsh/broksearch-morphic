export interface Theme {
  id: string
  name: string
  colors: {
    background: string
    text: string
    accent: string
    secondary: string
    card: string
  }
  fonts: {
    heading: string
    body: string
  }
  slideLayouts: string[]
}

export const themes: Theme[] = [
  {
    id: 'minimal_light',
    name: 'Minimal Light',
    colors: {
      background: '#FAFAFA',
      text: '#1A1A1A',
      accent: '#6366F1',
      secondary: '#E5E7EB',
      card: '#FFFFFF'
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter'
    },
    slideLayouts: ['title', 'bullet', 'two-column', 'image', 'quote']
  },
  {
    id: 'minimal_dark',
    name: 'Minimal Dark',
    colors: {
      background: '#0A0A0A',
      text: '#FFFFFF',
      accent: '#818CF8',
      secondary: '#262626',
      card: '#171717'
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter'
    },
    slideLayouts: ['title', 'bullet', 'two-column', 'image', 'quote']
  },
  {
    id: 'startup_pitch',
    name: 'Startup Pitch',
    colors: {
      background: '#0F172A',
      text: '#F8FAFC',
      accent: '#22C55E',
      secondary: '#1E293B',
      card: '#1E293B'
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter'
    },
    slideLayouts: ['title', 'bullet', 'two-column', 'image', 'quote', 'stats']
  },
  {
    id: 'academic',
    name: 'Academic',
    colors: {
      background: '#FDF8F0',
      text: '#1C1917',
      accent: '#B45309',
      secondary: '#E7E5E4',
      card: '#FFFFFF'
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter'
    },
    slideLayouts: ['title', 'bullet', 'two-column', 'image', 'quote']
  },
  {
    id: 'corporate',
    name: 'Corporate',
    colors: {
      background: '#F8FAFC',
      text: '#0F172A',
      accent: '#2563EB',
      secondary: '#CBD5E1',
      card: '#FFFFFF'
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter'
    },
    slideLayouts: ['title', 'bullet', 'two-column', 'image', 'quote', 'stats']
  },
  {
    id: 'creative',
    name: 'Creative',
    colors: {
      background: '#1C1917',
      text: '#FAFAFA',
      accent: '#F59E0B',
      secondary: '#292524',
      card: '#292524'
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter'
    },
    slideLayouts: ['title', 'bullet', 'two-column', 'image', 'quote']
  },
  {
    id: 'bold_gradient',
    name: 'Bold Gradient',
    colors: {
      background: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
      text: '#FFFFFF',
      accent: '#FFFFFF',
      secondary: 'rgba(255,255,255,0.2)',
      card: 'rgba(255,255,255,0.15)'
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter'
    },
    slideLayouts: ['title', 'bullet', 'two-column', 'image', 'quote']
  },
  {
    id: 'clean_report',
    name: 'Clean Report',
    colors: {
      background: '#FFFFFF',
      text: '#374151',
      accent: '#059669',
      secondary: '#F3F4F6',
      card: '#FFFFFF'
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter'
    },
    slideLayouts: ['title', 'bullet', 'two-column', 'image', 'quote', 'stats']
  }
]

export type ThemeId = (typeof themes)[number]['id']

export function getThemeById(id: string): Theme | undefined {
  return themes.find(theme => theme.id === id)
}
