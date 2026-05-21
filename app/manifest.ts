import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Brok',
    short_name: 'Brok',
    description:
      'AI workspace for search, mail, code, tools, and governed connectors.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone', 'browser'],
    orientation: 'any',
    background_color: '#f7f7f4',
    theme_color: '#ffffff',
    categories: ['productivity', 'utilities', 'business'],
    icons: [
      {
        src: '/pwa/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/pwa/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/pwa/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ],
    shortcuts: [
      {
        name: 'New Search',
        short_name: 'Search',
        description: 'Start a new Brok search.',
        url: '/',
        icons: [{ src: '/pwa/icon-192.png', sizes: '192x192' }]
      },
      {
        name: 'BrokMail',
        short_name: 'Mail',
        description: 'Open BrokMail.',
        url: '/brokmail',
        icons: [{ src: '/pwa/icon-192.png', sizes: '192x192' }]
      },
      {
        name: 'Brok Code',
        short_name: 'Code',
        description: 'Open the BrokCode builder.',
        url: '/brokcode',
        icons: [{ src: '/pwa/icon-192.png', sizes: '192x192' }]
      }
    ],
    screenshots: [
      {
        src: '/screenshot-2026-02-07.png',
        sizes: '1280x720',
        type: 'image/png',
        form_factor: 'wide',
        label: 'Brok workspace'
      }
    ]
  }
}
