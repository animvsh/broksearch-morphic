'use client'

import { useEffect, useRef, useState } from 'react'

import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void
  disabled?: boolean
  className?: string
}

type SpeechRecognitionResultLike = {
  isFinal?: boolean
  0?: { transcript?: string }
}

type SpeechRecognitionEventLike = Event & {
  results?: ArrayLike<SpeechRecognitionResultLike>
  resultIndex?: number
}

type SpeechRecognitionErrorEventLike = Event & {
  error?: string
  message?: string
}

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null
  return window.speechSynthesis ?? null
}

/**
 * PRD section 11 (Voice input/output).
 *
 * Renders a single-button mic control that toggles the Web Speech API
 * speech-to-text. While active, interim transcripts are forwarded to the
 * parent on every result. Errors fall back to a toast.
 */
export function VoiceInputButton({
  onTranscript,
  disabled = false,
  className
}: VoiceInputButtonProps) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isSupported, setIsSupported] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return Boolean(getSpeechRecognitionCtor())
  })

  const startRecording = () => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      setIsSupported(false)
      toast.error('Voice input is not supported in this browser.')
      return
    }

    const recognition = new Ctor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang =
      typeof navigator !== 'undefined' && navigator.language
        ? navigator.language
        : 'en-US'

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const results = Array.from(event.results ?? [])
      const lastFinal = results
        .filter(result => result?.isFinal)
        .map(result => result?.[0]?.transcript ?? '')
        .join(' ')
        .trim()
      if (lastFinal) {
        onTranscript(lastFinal)
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      const message = event?.error ?? event?.message ?? 'unknown_error'
      console.warn('Speech recognition error:', message)
      toast.error('Could not capture voice input. Please try again.')
      setIsRecording(false)
    }

    recognition.onend = () => {
      setIsRecording(false)
    }

    try {
      recognition.start()
      recognitionRef.current = recognition
      setIsRecording(true)
    } catch (err) {
      console.warn('Failed to start speech recognition:', err)
      toast.error('Could not start voice input.')
      setIsRecording(false)
    }
  }

  const stopRecording = () => {
    try {
      recognitionRef.current?.stop()
    } catch (err) {
      console.warn('Failed to stop speech recognition:', err)
    }
    setIsRecording(false)
  }

  const handleClick = () => {
    if (!isSupported) {
      toast.error('Voice input is not supported in this browser.')
      return
    }
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  if (!isSupported) {
    return null
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={isRecording ? 'Stop voice input' : 'Start voice input'}
      aria-pressed={isRecording}
      className={cn(
        'inline-flex size-11 items-center justify-center rounded-xl border border-zinc-200/80 bg-white/70 text-zinc-600 shadow-none transition-colors hover:bg-white hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 disabled:cursor-not-allowed disabled:opacity-60',
        isRecording &&
          'border-red-200 bg-red-50/80 text-red-600 hover:bg-red-50/90',
        className
      )}
      data-testid="voice-input-button"
    >
      {isRecording ? (
        <MicOff className="size-4 md:size-5" />
      ) : (
        <Mic className="size-4 md:size-5" />
      )}
    </button>
  )
}

interface VoiceOutputButtonProps {
  text: string
  className?: string
  disabled?: boolean
}

/**
 * Speaks the supplied text using the Web Speech API speech synthesis. Useful
 * for read-aloud answers (PRD section 11). Tapping the button again stops
 * the current utterance.
 */
export function VoiceOutputButton({
  text,
  className,
  disabled = false
}: VoiceOutputButtonProps) {
  const [isSpeaking, setIsSpeaking] = useState(false)

  useEffect(() => {
    if (!getSpeechSynthesis()) return
    return () => {
      try {
        window.speechSynthesis.cancel()
      } catch {
        // ignore
      }
    }
  }, [])

  const handleClick = () => {
    const synthesis = getSpeechSynthesis()
    if (!synthesis) {
      toast.error('Voice output is not supported in this browser.')
      return
    }
    if (isSpeaking) {
      synthesis.cancel()
      setIsSpeaking(false)
      return
    }
    if (!text?.trim()) {
      toast.error('Nothing to read aloud yet.')
      return
    }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    synthesis.speak(utterance)
    setIsSpeaking(true)
  }

  if (!getSpeechSynthesis()) {
    return null
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || !text?.trim()}
      aria-label={isSpeaking ? 'Stop read-aloud' : 'Read answer aloud'}
      aria-pressed={isSpeaking}
      className={cn(
        'inline-flex size-11 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 disabled:cursor-not-allowed disabled:opacity-60',
        className
      )}
      data-testid="voice-output-button"
    >
      {isSpeaking ? (
        <VolumeX className="size-4" />
      ) : (
        <Volume2 className="size-4" />
      )}
    </button>
  )
}
