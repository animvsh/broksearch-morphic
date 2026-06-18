import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FilesTab } from '../build-project-brain'

describe('BuildProjectBrain files tab', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads and saves persisted BrokCode project files', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return Response.json({
          file: {
            path: 'index.html',
            content: '<main>Updated CRM</main>',
            language: 'html'
          },
          project: {
            previewUrl: '/api/brokcode/previews/project-1/index.html',
            metadata: {
              preview: {
                mode: 'managed_live_preview'
              }
            }
          },
          previewUrl: '/api/brokcode/previews/project-1/index.html'
        })
      }

      expect(url).toBe('/api/brokcode/projects/project-1/files')
      return Response.json({
        files: [
          {
            path: 'index.html',
            content: '<main>CRM</main>',
            language: 'html'
          },
          {
            path: 'app.js',
            content: 'console.log("crm")',
            language: 'js'
          }
        ],
        project: {
          previewUrl: '/api/brokcode/previews/project-1/index.html',
          metadata: {
            preview: {
              mode: 'managed_live_preview'
            }
          }
        }
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const onFilesUpdated = vi.fn()

    render(
      <FilesTab
        projectId="project-1"
        files={[
          {
            path: 'index.html',
            language: 'html',
            size: 16,
            preview: '<main>CRM</main>'
          }
        ]}
        onFilesUpdated={onFilesUpdated}
      />
    )

    const editor = await screen.findByDisplayValue('<main>CRM</main>')
      expect(onFilesUpdated).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'index.html',
            size: '<main>CRM</main>'.length,
            preview: '<main>CRM</main>'
          })
        ]),
      'loaded',
      expect.objectContaining({
        previewUrl: '/api/brokcode/previews/project-1/index.html'
      })
    )
    fireEvent.change(editor, { target: { value: '<main>Updated CRM</main>' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/brokcode/projects/project-1/files',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            path: 'index.html',
            content: '<main>Updated CRM</main>',
            language: 'html'
          })
        })
      )
    })
    expect(
      await screen.findByText(
        'index.html saved. Recheck preview and publish readiness.'
      )
    ).toBeInTheDocument()
    expect(onFilesUpdated).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'index.html',
          size: '<main>Updated CRM</main>'.length,
          preview: '<main>Updated CRM</main>'
        })
      ]),
      'saved',
      expect.objectContaining({
        previewUrl: '/api/brokcode/previews/project-1/index.html'
      })
    )
  })

  it('surfaces server-cleared preview state after a saved file removes the renderable entry', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return Response.json({
          file: {
            path: 'index.html',
            content: 'Draft notes only',
            language: 'html'
          },
          allFiles: [
            {
              path: 'index.html',
              content: 'Draft notes only',
              language: 'html'
            }
          ],
          project: {
            previewUrl: null,
            metadata: {
              preview: {
                mode: 'managed_live_preview',
                unavailableReason: 'missing_renderable_entry'
              }
            }
          },
          previewUrl: null
        })
      }

      return Response.json({
        files: [
          {
            path: 'index.html',
            content: '<main>CRM</main>',
            language: 'html'
          }
        ],
        project: {
          previewUrl: '/api/brokcode/previews/project-1/index.html'
        }
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const onFilesUpdated = vi.fn()

    render(
      <FilesTab
        projectId="project-1"
        files={[
          {
            path: 'index.html',
            language: 'html',
            size: 16,
            preview: '<main>CRM</main>'
          }
        ]}
        onFilesUpdated={onFilesUpdated}
      />
    )

    const editor = await screen.findByDisplayValue('<main>CRM</main>')
    fireEvent.change(editor, { target: { value: 'Draft notes only' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText(
        'index.html saved. Preview unavailable because this project has no renderable index.html.'
      )
    ).toBeInTheDocument()
    expect(onFilesUpdated).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'index.html',
          preview: 'Draft notes only'
        })
      ]),
      'saved',
      expect.objectContaining({
        previewUrl: null,
        previewUnavailableReason:
          'Preview unavailable because this project has no renderable index.html.'
      })
    )
  })

  it('keeps editing disabled until a managed project exists', () => {
    render(
      <FilesTab
        projectId={null}
        files={[
          {
            path: 'index.html',
            language: 'html',
            size: 16,
            preview: '<main>CRM</main>'
          }
        ]}
      />
    )

    expect(screen.getByRole('button', { name: 'Load saved' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(
      screen.getByPlaceholderText('Create a managed BrokCode project before editing files.')
    ).toBeDisabled()
  })
})
