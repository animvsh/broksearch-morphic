import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BuildPreviewPanel } from '../build-preview-panel'

describe('BuildPreviewPanel', () => {
  it('shows an explicit unavailable state when saved files no longer have a renderable preview', () => {
    render(
      <BuildPreviewPanel
        previewUrl={null}
        phase="ready"
        files={[
          {
            path: 'index.html',
            language: 'html',
            size: 16,
            preview: 'Draft notes only'
          }
        ]}
        unavailableReason="Preview unavailable because this project has no renderable index.html."
      />
    )

    expect(screen.getByText('Preview unavailable.')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Preview unavailable because this project has no renderable index.html.'
      )
    ).toBeInTheDocument()
    expect(
      screen.queryByTitle('Brok Build preview')
    ).not.toBeInTheDocument()
  })
})
