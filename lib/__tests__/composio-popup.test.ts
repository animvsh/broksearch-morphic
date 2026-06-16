import { afterEach, describe, expect, it, vi } from 'vitest'

import { openComposioPopup } from '@/lib/composio-popup'

describe('openComposioPopup', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens a centered Composio popup and clears opener access', () => {
    const popup = { opener: window } as unknown as Window
    const open = vi.spyOn(window, 'open').mockReturnValue(popup)

    const result = openComposioPopup(
      'https://connect.example.com/gmail',
      'gmail'
    )

    expect(result).toBe(popup)
    expect(open).toHaveBeenCalledWith(
      'https://connect.example.com/gmail',
      'gmail',
      expect.stringContaining('popup=yes')
    )
    expect(popup.opener).toBeNull()
  })

  it('returns null when the browser blocks the popup', () => {
    vi.spyOn(window, 'open').mockReturnValue(null)

    expect(
      openComposioPopup('https://connect.example.com/gcal', 'gcal')
    ).toBeNull()
  })
})
