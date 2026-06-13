'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  BrokBuildBackendStatus,
  BrokBuildFilePreview,
  BrokBuildPhase,
  BrokStreamEvent
} from '@/lib/build/types'

export type BuildStreamState = {
  phase: BrokBuildPhase
  progress: number
  events: BrokStreamEvent[]
  files: BrokBuildFilePreview[]
  logs: Array<{ time: string; level: 'info' | 'warn' | 'error'; message: string }>
  previewUrl: string | null
  projectId: string | null
  deploymentUrl: string | null
  opencodeSessionId: string | null
  backendStatus: BrokBuildBackendStatus
  errorMessage: string | null
}

const INITIAL_STATE: BuildStreamState = {
  phase: 'idle',
  progress: 0,
  events: [],
  files: [],
  logs: [],
  previewUrl: null,
  projectId: null,
  deploymentUrl: null,
  opencodeSessionId: null,
  backendStatus: 'not_started',
  errorMessage: null
}

function applyEvent(
  state: BuildStreamState,
  event: BrokStreamEvent
): BuildStreamState {
  const nextEvents = [...state.events, event]
  switch (event.kind) {
    case 'phase':
      return { ...state, events: nextEvents, phase: event.phase }
    case 'progress':
      return { ...state, events: nextEvents, progress: event.percent }
    case 'files':
      return { ...state, events: nextEvents, files: event.files }
    case 'log':
      return {
        ...state,
        events: nextEvents,
        logs: [
          ...state.logs,
          {
            time: new Date().toISOString(),
            level: event.level,
            message: event.message
          }
        ]
      }
    case 'preview_url':
      return { ...state, events: nextEvents, previewUrl: event.url }
    case 'brokcode_project':
      return {
        ...state,
        events: nextEvents,
        projectId: event.projectId,
        previewUrl: event.previewUrl,
        deploymentUrl: event.deploymentUrl
      }
    case 'opencode_session':
      return {
        ...state,
        events: nextEvents,
        opencodeSessionId: event.sessionId
      }
    case 'backend_status':
      return { ...state, events: nextEvents, backendStatus: event.status }
    case 'error':
      return {
        ...state,
        events: nextEvents,
        phase: 'failed',
        errorMessage: event.message
      }
    case 'done':
      return {
        ...state,
        events: nextEvents,
        phase: 'ready',
        progress: 100,
        previewUrl: event.previewUrl,
        projectId: event.projectId
      }
    default:
      return { ...state, events: nextEvents }
  }
}

export function useBrokBuildStream() {
  const [state, setState] = useState<BuildStreamState>(INITIAL_STATE)
  const abortRef = useRef<AbortController | null>(null)
  const latestPromptRef = useRef<string | null>(null)

  const start = useCallback(
    async (prompt: string) => {
      latestPromptRef.current = prompt
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setState(INITIAL_STATE)

      try {
        const res = await fetch('/api/build/stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt }),
          signal: ctrl.signal
        })

        if (!res.ok || !res.body) {
          setState(s => ({
            ...s,
            phase: 'failed',
            errorMessage: `Stream failed (${res.status}).`
          }))
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const blocks = buffer.split('\n\n')
          buffer = blocks.pop() ?? ''
          for (const block of blocks) {
            const line = block
              .split('\n')
              .find(l => l.startsWith('data:'))
            if (!line) continue
            try {
              const json = line.slice(5).trim()
              if (!json) continue
              const event = JSON.parse(json) as BrokStreamEvent
              setState(s => applyEvent(s, event))
            } catch {
              // ignore malformed lines
            }
          }
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
        setState(s => ({
          ...s,
          phase: 'failed',
          errorMessage:
            error instanceof Error ? error.message : 'Build stream failed.'
        }))
      }
    },
    []
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const send = useCallback(async (basePrompt: string, editMessage: string) => {
    const message = editMessage.trim()
    if (!message) return
    const combined = `${basePrompt}\n\nEdit request: ${message}`
    setState(s => ({
      ...s,
      phase: 'adjusting',
      logs: [
        ...s.logs,
        {
          time: new Date().toISOString(),
          level: 'info',
          message: `Edit requested: ${message}`
        }
      ]
    }))
    await start(combined)
  }, [start])

  const sendEdit = useCallback(
    async (message: string) => {
      const prompt = latestPromptRef.current
      if (!prompt) return
      await send(prompt, message)
    },
    [send]
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  return useMemo(
    () => ({ state, start, stop, send, sendEdit }),
    [state, start, stop, send, sendEdit]
  )
}
