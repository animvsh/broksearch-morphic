'use client'

import { useEffect, useState } from 'react'

import {
  ChevronDown,
  KeyRound,
  Play,
  Settings2,
  Sparkles,
  Zap
} from 'lucide-react'

import { BROK_MODELS } from '@/lib/brok/models'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import { CodeSnippet } from './code-snippet'
import { ResponseViewer } from './response-viewer'

const MODELS = Object.entries(BROK_MODELS).map(([id, config]) => ({
  id,
  name: config.name,
  description: config.description,
  contextWindow: config.contextWindow ?? config.maxTokens,
  supportsCode: config.supportsCode,
  supportsSearch: config.supportsSearch,
  supportsStreaming: config.supportsStreaming,
  supportsTools: config.supportsTools
}))

const BROK_KEY_STORAGE = 'brok_code_api_key'
const PLAYGROUND_KEY_STORAGE = 'brok_playground_key'
const MODEL_SPEED_NOTES: Record<string, string> = {
  'MiniMax-M2.7': 'About 60 tokens/sec',
  'MiniMax-M2.7-highspeed': 'About 100 tokens/sec',
  'MiniMax-M2.5': 'About 60 tokens/sec',
  'MiniMax-M2.5-highspeed': 'About 100 tokens/sec',
  'MiniMax-M2.1': 'About 60 tokens/sec',
  'MiniMax-M2.1-highspeed': 'About 100 tokens/sec',
  'MiniMax-M2': 'Reasoning and agentic path',
  'brok-lite': 'Highspeed MiniMax route',
  'brok-code': 'Brok default coding-agent route',
  'brok-search': 'Search-enabled route',
  'brok-search-pro': 'Deep search route',
  'brok-agent': 'Tool and browser agent route',
  'brok-reasoning': 'Reasoning route'
}
const PLAYGROUND_STREAM_STEPS = [
  'Routing your request',
  'Streaming tokens back',
  'Finalizing response payload'
]

function isValidBrokKey(value: string) {
  return value.trim().startsWith('brok_sk_')
}

function formatTokens(value: number) {
  return value.toLocaleString('en-US')
}

export function ChatPlayground() {
  const [selectedModel, setSelectedModel] = useState('brok-code')
  const [systemMessage, setSystemMessage] = useState(
    'You are Brok Code, a coding agent for precise repository work. Do not reveal hidden reasoning or private planning; answer with user-facing progress and results only.'
  )
  const [userMessage, setUserMessage] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(1000)
  const [stream, setStream] = useState(true)
  const [loading, setLoading] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [savedApiKey, setSavedApiKey] = useState<string | null>(null)
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  const [response, setResponse] = useState<{
    content: string
    usage?: any
    done: boolean
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingStepIndex, setLoadingStepIndex] = useState(0)
  const selectedModelDetails =
    MODELS.find(model => model.id === selectedModel) ?? MODELS[0]

  useEffect(() => {
    const stored =
      localStorage.getItem(BROK_KEY_STORAGE) ||
      localStorage.getItem(PLAYGROUND_KEY_STORAGE)

    if (stored) {
      setSavedApiKey(stored)
      setApiKeyInput(stored)
    }
  }, [])

  useEffect(() => {
    if (!loading) {
      setLoadingStepIndex(0)
      return
    }

    const timer = window.setInterval(() => {
      setLoadingStepIndex(
        current => (current + 1) % PLAYGROUND_STREAM_STEPS.length
      )
    }, 900)

    return () => window.clearInterval(timer)
  }, [loading])

  function saveApiKey() {
    const trimmed = apiKeyInput.trim()
    if (!isValidBrokKey(trimmed)) {
      setApiKeyError('Enter a Brok API key that starts with brok_sk_.')
      return
    }

    localStorage.setItem(BROK_KEY_STORAGE, trimmed)
    localStorage.setItem(PLAYGROUND_KEY_STORAGE, trimmed)
    setSavedApiKey(trimmed)
    setApiKeyError(null)
  }

  function clearApiKey() {
    localStorage.removeItem(BROK_KEY_STORAGE)
    localStorage.removeItem(PLAYGROUND_KEY_STORAGE)
    setSavedApiKey(null)
    setApiKeyInput('')
    setApiKeyError(null)
  }

  async function handleSubmit() {
    if (!userMessage.trim()) return

    const apiKey = savedApiKey || apiKeyInput.trim()
    if (!isValidBrokKey(apiKey)) {
      setApiKeyError('Save a Brok API key before running a request.')
      return
    }

    setLoading(true)
    setError(null)
    setResponse(null)
    setApiKeyError(null)

    try {
      const res = await fetch('/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: userMessage }
          ],
          stream,
          temperature,
          max_tokens: maxTokens
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error?.message || 'Request failed')
      }

      if (stream) {
        const reader = res.body?.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let fullContent = ''

        while (reader) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split(/\r?\n/)
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                if (parsed.choices?.[0]?.delta?.content) {
                  fullContent += parsed.choices[0].delta.content
                  setResponse({
                    content: fullContent,
                    done: false
                  })
                }
              } catch {}
            }
          }
        }

        setResponse({ content: fullContent, done: true })
      } else {
        const data = await res.json()
        setResponse({
          content: data.choices?.[0]?.message?.content || '',
          usage: data.usage,
          done: true
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="playground-shell grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,44dvh)_minmax(0,1fr)] overflow-hidden rounded-xl border border-border/70 bg-background/95 lg:grid-cols-[420px_1fr] lg:grid-rows-1 xl:grid-cols-[460px_1fr]">
      <div className="dashboard-rail min-h-0 overflow-y-auto border-b p-3 sm:p-4 lg:border-b-0 lg:border-r">
        <div className="space-y-3">
          <section className="dashboard-card p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <KeyRound className="size-4 text-muted-foreground" />
                <p className="truncate text-sm font-semibold">API Key</p>
              </div>
              <span className="rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground">
                {savedApiKey ? 'Saved' : 'Required'}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <Input
                id="playground-key"
                value={apiKeyInput}
                onChange={event => {
                  setApiKeyInput(event.target.value)
                  if (apiKeyError) setApiKeyError(null)
                }}
                placeholder="brok_sk_..."
                type="password"
                autoComplete="off"
                className="h-9"
              />
              <Button size="sm" className="h-9" onClick={saveApiKey}>
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                onClick={clearApiKey}
              >
                Clear
              </Button>
            </div>
            {apiKeyError && (
              <p className="mt-2 text-xs text-destructive">{apiKeyError}</p>
            )}
            {!apiKeyError && (
              <p className="mt-2 text-xs text-muted-foreground">
                Stored locally in this browser for quick playground retries.
              </p>
            )}
          </section>

          <section className="dashboard-card p-3">
            <div className="mb-3 flex items-center gap-2">
              <Zap className="size-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Request</p>
            </div>
            <div className="grid gap-3">
              <div>
                <Label className="text-xs">Model</Label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELS.map(model => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {selectedModelDetails?.description}
                </p>
                {selectedModelDetails && (
                  <div className="mt-2 grid gap-2 rounded-md border border-border/70 bg-muted/25 p-2 text-xs text-muted-foreground">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="block text-[11px] uppercase text-muted-foreground/80">
                          Context
                        </span>
                        <span className="font-medium text-foreground">
                          {formatTokens(selectedModelDetails.contextWindow)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[11px] uppercase text-muted-foreground/80">
                          Speed
                        </span>
                        <span className="font-medium text-foreground">
                          {MODEL_SPEED_NOTES[selectedModelDetails.id] ??
                            'Streaming supported'}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedModelDetails.supportsStreaming && (
                        <span className="rounded bg-background px-1.5 py-0.5">
                          Streaming
                        </span>
                      )}
                      {selectedModelDetails.supportsTools && (
                        <span className="rounded bg-background px-1.5 py-0.5">
                          Tools
                        </span>
                      )}
                      {selectedModelDetails.supportsSearch && (
                        <span className="rounded bg-background px-1.5 py-0.5">
                          Search
                        </span>
                      )}
                      {selectedModelDetails.supportsCode && (
                        <span className="rounded bg-background px-1.5 py-0.5">
                          Code
                        </span>
                      )}
                    </div>
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Use <code>brok-code</code> as the default AI layer for Codex,
                  Claude Code, and OpenAI-compatible coding tools. Pick a direct
                  MiniMax ID only when you want that exact upstream model.
                </p>
              </div>

              <div>
                <Label htmlFor="user" className="text-xs">
                  User Message
                </Label>
                <Textarea
                  id="user"
                  value={userMessage}
                  onChange={e => setUserMessage(e.target.value)}
                  rows={7}
                  placeholder="What would you like to ask Brok?"
                  className="mt-1 min-h-40 resize-none"
                />
              </div>

              <details className="group rounded-md border border-border/70 bg-muted/35 p-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium">
                  <span className="inline-flex items-center gap-2">
                    <Settings2 className="size-3.5" />
                    Advanced settings
                  </span>
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-3 grid gap-3">
                  <div>
                    <Label htmlFor="system" className="text-xs">
                      System Message
                    </Label>
                    <Textarea
                      id="system"
                      value={systemMessage}
                      onChange={e => setSystemMessage(e.target.value)}
                      rows={3}
                      className="mt-1 resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="temp" className="text-xs">
                        Temperature
                      </Label>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          id="temp"
                          type="range"
                          min={0}
                          max={1}
                          step={0.1}
                          value={temperature}
                          onChange={e => setTemperature(Number(e.target.value))}
                          className="min-w-0 flex-1"
                        />
                        <span className="w-8 text-right text-xs">
                          {temperature}
                        </span>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="maxTokens" className="text-xs">
                        Max Tokens
                      </Label>
                      <Input
                        id="maxTokens"
                        type="number"
                        value={maxTokens}
                        onChange={e => setMaxTokens(Number(e.target.value))}
                        className="mt-1 h-9"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                    <Label htmlFor="stream" className="text-xs">
                      Stream Response
                    </Label>
                    <Switch
                      id="stream"
                      checked={stream}
                      onCheckedChange={setStream}
                    />
                  </div>
                </div>
              </details>

              <Button
                className="h-10 gap-2"
                onClick={handleSubmit}
                disabled={loading || !userMessage.trim() || !savedApiKey}
              >
                <Play className="size-4" />
                {loading ? 'Streaming...' : 'Run'}
              </Button>
            </div>
          </section>
        </div>
      </div>

      <div className="min-h-0 overflow-hidden p-3 sm:p-4">
        <Tabs
          defaultValue="response"
          className="dashboard-card flex h-full min-h-0 flex-col"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2">
            <TabsList className="h-9 rounded-md border border-border/70 bg-muted/40 p-1">
              <TabsTrigger
                value="response"
                className="data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
              >
                Response
              </TabsTrigger>
              <TabsTrigger
                value="snippets"
                className="data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
              >
                Snippets
              </TabsTrigger>
            </TabsList>
            {loading && (
              <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-xs text-muted-foreground shadow-sm">
                <span className="size-2 animate-pulse rounded-full bg-primary" />
                {PLAYGROUND_STREAM_STEPS[loadingStepIndex]}
              </span>
            )}
          </div>

          <TabsContent
            value="response"
            className="m-0 min-h-0 flex-1 overflow-y-auto p-4"
          >
            {loading && (
              <div className="mb-4 overflow-hidden rounded-xl border border-border/60 bg-muted/25 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground/80">
                  <Sparkles className="size-4 text-primary" />
                  Live stream in progress
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {PLAYGROUND_STREAM_STEPS[loadingStepIndex]}
                </p>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted/70">
                  <div className="h-full w-2/5 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-primary/40 via-primary to-violet-500/70" />
                </div>
              </div>
            )}
            {!loading && !response && !error && (
              <div className="mb-4 rounded-xl border border-dashed border-border/70 bg-muted/20 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="size-4 text-primary" />
                  Ready to stream
                </div>
                <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                  Drop in a prompt on the left and this pane will fill with the
                  live response, usage metadata, and copy-ready payloads.
                </p>
              </div>
            )}
            <ResponseViewer response={response} error={error} />
          </TabsContent>

          <TabsContent
            value="snippets"
            className="m-0 min-h-0 flex-1 overflow-y-auto p-4"
          >
            <CodeSnippet
              model={selectedModel}
              messages={[
                { role: 'system', content: systemMessage },
                {
                  role: 'user',
                  content: userMessage || 'Build a production-ready AI feature.'
                }
              ]}
              stream={stream}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
