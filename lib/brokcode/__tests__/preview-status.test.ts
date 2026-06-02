import { describe, expect, it } from 'vitest'

import {
  isAllowedBrokCodePreviewStatusUrl,
  isReadyManagedBrokCodePreviewStatusUrl
} from '../preview-status'

const publicOrigin = 'https://brok.test'

function url(value: string) {
  return new URL(value)
}

describe('BrokCode preview status URL policy', () => {
  it('short-circuits managed preview and runtime URLs as ready', () => {
    expect(
      isReadyManagedBrokCodePreviewStatusUrl(
        url('https://brok.test/api/brokcode/previews/project_123/index.html'),
        publicOrigin
      )
    ).toBe(true)
    expect(
      isReadyManagedBrokCodePreviewStatusUrl(
        url('https://brok.test/api/brokcode/runtime/runtime_123/'),
        publicOrigin
      )
    ).toBe(true)
  })

  it('allows managed app deployment URLs to be checked', () => {
    expect(
      isAllowedBrokCodePreviewStatusUrl(
        url('https://brok.test/brokcode/apps/coffee-shop--project_123'),
        publicOrigin
      )
    ).toBe(true)
  })

  it('blocks arbitrary same-origin URLs from server-side preview checks', () => {
    expect(
      isAllowedBrokCodePreviewStatusUrl(
        url('https://brok.test/api/brokcode/key'),
        publicOrigin
      )
    ).toBe(false)
    expect(
      isAllowedBrokCodePreviewStatusUrl(
        url('https://brok.test/brokcode'),
        publicOrigin
      )
    ).toBe(false)
  })

  it('allows configured external preview origins and their www variants', () => {
    expect(
      isAllowedBrokCodePreviewStatusUrl(
        url('https://preview.example.com/app'),
        publicOrigin,
        {
          allowedOrigins: ['https://preview.example.com']
        }
      )
    ).toBe(true)
    expect(
      isAllowedBrokCodePreviewStatusUrl(
        url('https://www.preview.example.com/app'),
        publicOrigin,
        {
          allowedOrigins: ['https://preview.example.com']
        }
      )
    ).toBe(true)
  })

  it('keeps localhost preview checks available outside production', () => {
    expect(
      isAllowedBrokCodePreviewStatusUrl(
        url('http://localhost:5173/'),
        publicOrigin,
        { nodeEnv: 'development' }
      )
    ).toBe(true)
    expect(
      isAllowedBrokCodePreviewStatusUrl(
        url('http://localhost:5173/'),
        publicOrigin,
        { allowPrivatePreview: false, nodeEnv: 'production' }
      )
    ).toBe(false)
  })
})
