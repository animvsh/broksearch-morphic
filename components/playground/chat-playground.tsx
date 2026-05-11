'use client'

import { useEffect, useState } from 'react'

import { ChevronDown, KeyRound, Play, Settings2, Zap } from 'lucide-react'

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
  description: config.description
}))

const BROK_KEY_STORAGE = 'brok_code_api_key'
const PLAYGROUND_KEY_STORAGE = 'brok_playground_key'

function isValidBrokKey(value: string) {
  return value.trim().startsWith('brok_sk_')
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

  useEffect(() => {
    const stored =
      localStorage.getItem(BROK_KEY_STORAGE) ||
      localStorage.getItem(PLAYGROUND_KEY_STORAGE)

    if (stored) {
      setSavedApiKey(stored)
      setApiKeyInput(stored)
    }
  }, [])

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
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[420px_1fr] xl:grid-cols-[460px_1fr]">
      <div className="min-h-0 overflow-y-auto border-b bg-muted/10 p-3 sm:p-4 lg:border-b-0 lg:border-r">
        <div className="space-y-3">
          <section className="rounded-md border bg-background p-3">
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
          </section>

          <section className="rounded-md border bg-background p-3">
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
                  {MODELS.find(m => m.id === selectedModel)?.description}
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

              <details className="group rounded-md border bg-muted/20 p-3">
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
                  <div className="grid grid-cols-2 gap-3">
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
                {loading ? 'Running...' : 'Run'}
              </Button>
            </div>
          </section>
        </div>
      </div>

      <div className="min-h-0 overflow-hidden p-3 sm:p-4">
        <Tabs defaultValue="response" className="flex h-full min-h-0 flex-col rounded-md border bg-background">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2">
            <TabsList className="h-9">
              <TabsTrigger value="response">Response</TabsTrigger>
              <TabsTrigger value="snippets">Snippets</TabsTrigger>
            </TabsList>
            {loading && (
              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <span className="size-2 animate-pulse rounded-full bg-primary" />
                Streaming
              </span>
            )}
          </div>

          <TabsContent
            value="response"
            className="m-0 min-h-0 flex-1 overflow-y-auto p-4"
          >
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
                  content:
                    userMessage || 'Build a production-ready AI feature.'
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
