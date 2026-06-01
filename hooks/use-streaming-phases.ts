'use client'

import { useEffect, useRef, useState } from 'react'

export type StreamingPhase =
  | 'idle'
  | 'reading'
  | 'gathering'
  | 'synthesizing'
  | 'complete'
  | 'error'

export interface StreamingState {
  phase: StreamingPhase
  sourceCount: number
  sources: SourcePreview[]
  elapsedMs: number
  startedAt: number | null
  error: string | null
}

export interface SourcePreview {
  id: string
  title: string
  url: string
  domain: string
  favicon?: string
  snippet?: string
}

const INITIAL: StreamingState = {
  phase: 'idle',
  sourceCount: 0,
  sources: [],
  elapsedMs: 0,
  startedAt: null,
  error: null
}

export function useStreamingPhases(isActive: boolean) {
  const [state, setState] = useState<StreamingState>(INITIAL)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isActive) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }
    let firstTick = true
    intervalRef.current = setInterval(() => {
      setState(prev => {
        if (firstTick) {
          firstTick = false
          return {
            phase: 'reading',
            sourceCount: 0,
            sources: [],
            elapsedMs: 0,
            startedAt: Date.now(),
            error: null
          }
        }
        if (!prev.startedAt) return prev
        return { ...prev, elapsedMs: Date.now() - prev.startedAt }
      })
    }, 100)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isActive])

  const setPhase = (phase: StreamingPhase) => {
    setState(prev => ({ ...prev, phase }))
  }

  const addSource = (source: SourcePreview) => {
    setState(prev => {
      if (prev.sources.some(s => s.url === source.url)) return prev
      return {
        ...prev,
        sources: [...prev.sources, source],
        sourceCount: prev.sourceCount + 1,
        phase: prev.phase === 'reading' ? 'gathering' : prev.phase
      }
    })
  }

  const setSources = (sources: SourcePreview[]) => {
    setState(prev => ({
      ...prev,
      sources,
      sourceCount: sources.length,
      phase: sources.length > 0 ? 'gathering' : prev.phase
    }))
  }

  const startSynthesizing = () => {
    setState(prev =>
      prev.phase === 'synthesizing' ? prev : { ...prev, phase: 'synthesizing' }
    )
  }

  const complete = () => {
    setState(prev => ({ ...prev, phase: 'complete' }))
  }

  const fail = (error: string) => {
    setState(prev => ({ ...prev, phase: 'error', error }))
  }

  const reset = () => {
    setState(INITIAL)
  }

  return {
    state,
    setPhase,
    addSource,
    setSources,
    startSynthesizing,
    complete,
    fail,
    reset
  }
}

export function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}m ${rem}s`
}
