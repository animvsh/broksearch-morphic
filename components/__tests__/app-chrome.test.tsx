import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppChrome } from '../app-chrome'

const mocks = vi.hoisted(() => ({
  pathname: '/'
}))

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname
}))

vi.mock('@/components/app-sidebar', () => ({
  default: () => <aside>APP_SIDEBAR</aside>
}))

vi.mock('@/components/header', () => ({
  default: () => <header>APP_HEADER</header>
}))

vi.mock('@/components/artifact/artifact-root', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )
}))

vi.mock('@/components/keyboard-shortcut-handler', () => ({
  KeyboardShortcutHandler: () => null
}))

vi.mock('@/components/mobile-app-nav', () => ({
  MobileAppNav: () => null
}))

vi.mock('@/components/pwa-lifecycle', () => ({
  PwaLifecycle: () => null
}))

vi.mock('@/components/feature-request-widget', () => ({
  FeatureRequestWidget: () => null
}))

describe('AppChrome', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    })
  })

  it('renders anonymous docs pages without the private app sidebar', () => {
    mocks.pathname = '/docs/brokmail'

    render(
      <AppChrome user={null}>
        <div>Docs content</div>
      </AppChrome>
    )

    expect(screen.getByText('Docs content')).toBeInTheDocument()
    expect(screen.queryByText('APP_SIDEBAR')).not.toBeInTheDocument()
    expect(screen.queryByText('APP_HEADER')).not.toBeInTheDocument()
  })

  it('keeps the app shell on non-public app routes', () => {
    mocks.pathname = '/search'

    render(
      <AppChrome user={null}>
        <div>Search content</div>
      </AppChrome>
    )

    expect(screen.getByText('Search content')).toBeInTheDocument()
    expect(screen.getByText('APP_SIDEBAR')).toBeInTheDocument()
    expect(screen.getByText('APP_HEADER')).toBeInTheDocument()
  })
})
