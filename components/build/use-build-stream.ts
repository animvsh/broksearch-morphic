'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  BrokBuildBackendResourcePlan,
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
  previewUnavailableReason: string | null
  projectId: string | null
  deploymentUrl: string | null
  opencodeSessionId: string | null
  projectSource: 'brokcode_execute' | 'degraded_fallback' | null
  projectDegraded: boolean
  projectMessage: string | null
  backendStatus: BrokBuildBackendStatus
  backendPlan: BrokBuildBackendResourcePlan | null
  errorMessage: string | null
}

type BuildStreamStartOptions = {
  projectId?: string
  requireBrokCodeExecution?: boolean
}

const INITIAL_STATE: BuildStreamState = {
  phase: 'idle',
  progress: 0,
  events: [],
  files: [],
  logs: [],
  previewUrl: null,
  previewUnavailableReason: null,
  projectId: null,
  deploymentUrl: null,
  opencodeSessionId: null,
  projectSource: null,
  projectDegraded: false,
  projectMessage: null,
  backendStatus: 'not_started',
  backendPlan: null,
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
      return {
        ...state,
        events: nextEvents,
        previewUrl: event.url,
        previewUnavailableReason: event.url ? null : state.previewUnavailableReason
      }
    case 'brokcode_project':
      return {
        ...state,
        events: nextEvents,
        projectId: event.projectId,
        previewUrl: event.previewUrl,
        previewUnavailableReason: event.previewUrl
          ? null
          : (event.message ?? state.previewUnavailableReason),
        deploymentUrl: event.deploymentUrl,
        projectSource: event.source ?? null,
        projectDegraded: event.degraded === true,
        projectMessage: event.message ?? null
      }
    case 'opencode_session':
      return {
        ...state,
        events: nextEvents,
        opencodeSessionId: event.sessionId
      }
    case 'backend_status':
      return { ...state, events: nextEvents, backendStatus: event.status }
    case 'backend_plan':
      return { ...state, events: nextEvents, backendPlan: event.plan }
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
        previewUnavailableReason: event.previewUrl ? null : state.previewUnavailableReason,
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
  const projectIdRef = useRef<string | null>(null)

  useEffect(() => {
    projectIdRef.current = state.projectId
  }, [state.projectId])

  const start = useCallback(
    async (
      prompt: string,
      options?: BuildStreamStartOptions
    ) => {
      latestPromptRef.current = prompt
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setState(INITIAL_STATE)

      try {
        const res = await fetch('/api/build/stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            prompt,
            projectId: options?.projectId,
            require_brokcode_execution: options?.requireBrokCodeExecution
          }),
          signal: ctrl.signal
        })

        if (!res.ok || !res.body) {
          setState(s => ({
            ...s,
            phase: 'failed',
            errorMessage: `Stream failed (${res.status}).`
          }))
          return false
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let failed = false

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
              if (event.kind === 'error') failed = true
              setState(s => applyEvent(s, event))
            } catch {
              // ignore malformed lines
            }
          }
        }
        return !failed
      } catch (error) {
        if ((error as Error).name === 'AbortError') return false
        setState(s => ({
          ...s,
          phase: 'failed',
          errorMessage:
            error instanceof Error ? error.message : 'Build stream failed.'
        }))
        return false
      }
    },
    []
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const send = useCallback(
    async (
      basePrompt: string,
      editMessage: string,
      options?: Pick<BuildStreamStartOptions, 'requireBrokCodeExecution'>
    ) => {
      const message = editMessage.trim()
      if (!message) return false
      const combined = `${basePrompt}\n\nEdit request: ${message}`
      const projectId = projectIdRef.current
      setState(s => ({
        ...s,
        phase: 'adjusting',
        logs: [
          ...s.logs,
          {
            time: new Date().toISOString(),
            level: 'info',
            message: projectId
              ? `Edit requested for project ${projectId}: ${message}`
              : `Edit requested: ${message}`
          }
        ]
      }))
      return await start(
        combined,
        projectId
          ? {
              projectId,
              requireBrokCodeExecution: options?.requireBrokCodeExecution
            }
          : {
              requireBrokCodeExecution: options?.requireBrokCodeExecution
            }
      )
    },
    [start]
  )

  const sendEdit = useCallback(
    async (
      message: string,
      options?: Pick<BuildStreamStartOptions, 'requireBrokCodeExecution'>
    ) => {
      const prompt = latestPromptRef.current
      if (!prompt) return false
      return await send(prompt, message, options)
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
    () => ({
      state,
      start,
      stop,
      send,
      sendEdit,
      setFiles: (
        files: BrokBuildFilePreview[],
        options?: {
          previewUrl?: string | null
          previewUnavailableReason?: string | null
          projectMessage?: string | null
        }
      ) => {
        setState(s => ({
          ...s,
          files,
          previewUrl:
            options && 'previewUrl' in options
              ? (options.previewUrl ?? null)
              : s.previewUrl,
          previewUnavailableReason:
            options && 'previewUnavailableReason' in options
              ? (options.previewUnavailableReason ?? null)
              : s.previewUnavailableReason,
          projectMessage:
            options && 'projectMessage' in options
              ? (options.projectMessage ?? null)
              : s.projectMessage
        }))
      }
    }),
    [state, start, stop, send, sendEdit]
  )
}
