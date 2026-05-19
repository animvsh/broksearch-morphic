import { describe, expect, it } from 'vitest'

import {
  getManagedPreviewAsset,
  makeManagedPreviewUrl,
  normalizeManagedPreviewPath,
  resolvePublicPreviewOrigin
} from '../preview'

const project = {
  id: 'project_123',
  name: 'Coffee Shop',
  slug: 'coffee-shop'
}

describe('BrokCode managed preview', () => {
  it('serves saved index.html as a managed preview asset', () => {
    const asset = getManagedPreviewAsset({
      project,
      pathParts: ['index.html'],
      files: [
        {
          path: 'index.html',
          content: '<h1>Coffee Shop</h1>',
          language: 'html'
        }
      ]
    })

    expect(asset).toMatchObject({
      content: '<h1>Coffee Shop</h1>',
      contentType: 'text/html; charset=utf-8',
      path: 'index.html',
      status: 200
    })
  })

  it('blocks traversal paths before file lookup', () => {
    expect(normalizeManagedPreviewPath(['..', '.env'])).toBeNull()
    expect(
      getManagedPreviewAsset({
        project,
        pathParts: ['..', '.env'],
        files: [
          {
            path: '.env',
            content: 'SECRET=value'
          }
        ]
      })
    ).toBeNull()
  })

  it('generates a stable same-origin preview URL', () => {
    expect(
      makeManagedPreviewUrl({
        origin: 'https://www.brok.fyi/',
        projectId: 'project_123'
      })
    ).toBe('https://www.brok.fyi/api/brokcode/previews/project_123/index.html')
  })

  it('uses forwarded public host instead of Railway bind address', () => {
    expect(
      resolvePublicPreviewOrigin({
        url: 'https://0.0.0.0:8080/api/brokcode/execute',
        headers: new Headers({
          'x-forwarded-host': 'www.brok.fyi',
          'x-forwarded-proto': 'https'
        })
      })
    ).toBe('https://www.brok.fyi')
  })
})
