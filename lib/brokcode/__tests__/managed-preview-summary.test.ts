import { describe, expect, it } from 'vitest'

import { buildManagedPreviewSummary } from '../managed-preview-summary'

describe('buildManagedPreviewSummary', () => {
  it('describes the managed preview instead of repo-local files', () => {
    const summary = buildManagedPreviewSummary({
      command: 'Build a polished landing page',
      files: [
        { path: 'index.html' },
        { path: 'styles.css' },
        { path: 'app.js' }
      ],
      previewUrl:
        'https://www.brok.fyi/api/brokcode/previews/project/index.html'
    })

    expect(summary).toContain('managed BrokCode preview')
    expect(summary).toContain('Files: index.html, styles.css, app.js.')
    expect(summary).toContain(
      'https://www.brok.fyi/api/brokcode/previews/project/index.html'
    )
    expect(summary).not.toContain('/app/public')
    expect(summary).not.toContain('open `index.html` directly')
  })
})
