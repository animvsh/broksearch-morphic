import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useStreamingPhases } from '../use-streaming-phases'

describe('useStreamingPhases', () => {
  it('enters the reading phase immediately when mounted active', () => {
    const { result } = renderHook(() => useStreamingPhases(true))

    expect(result.current.state.phase).toBe('reading')
    expect(result.current.state.elapsedMs).toBe(0)
    expect(result.current.state.startedAt).toEqual(expect.any(Number))
  })

  it('enters the reading phase immediately when activated after mount', async () => {
    const { rerender, result } = renderHook(
      ({ isActive }: { isActive: boolean }) => useStreamingPhases(isActive),
      { initialProps: { isActive: false } }
    )

    expect(result.current.state.phase).toBe('idle')

    rerender({ isActive: true })

    await waitFor(() => {
      expect(result.current.state.phase).toBe('reading')
    })
    expect(result.current.state.startedAt).toEqual(expect.any(Number))
  })

  it('resets to idle when deactivated', async () => {
    const { rerender, result } = renderHook(
      ({ isActive }: { isActive: boolean }) => useStreamingPhases(isActive),
      { initialProps: { isActive: true } }
    )

    expect(result.current.state.phase).toBe('reading')

    rerender({ isActive: false })

    await waitFor(() => {
      expect(result.current.state.phase).toBe('idle')
    })
    expect(result.current.state.startedAt).toBeNull()
  })
})
