'use client'

import { useState } from 'react'

import { Check, Copy } from 'lucide-react'

import { safeCopyTextToClipboard } from '@/lib/utils/copy-to-clipboard'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface CodeSnippetProps {
  model: string
  messages: Array<{ role: string; content: string }>
  stream: boolean
}

export function CodeSnippet({ model, messages, stream }: CodeSnippetProps) {
  const [copied, setCopied] = useState<string | null>(null)

  const curl = `curl https://api.brok.ai/v1/chat/completions \\
  -H "Authorization: Bearer $BROK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "messages": ${JSON.stringify(messages, null, 2)},
    "stream": ${stream}
  }'`

  const javascript = `const response = await fetch("https://api.brok.ai/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.BROK_API_KEY}\`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "${model}",
    messages: ${JSON.stringify(messages, null, 2)},
    stream: ${stream}
  })
});

const data = await response.json();
console.log(data);`

  const python = `import os
import requests

response = requests.post(
    "https://api.brok.ai/v1/chat/completions",
    headers={
        "Authorization": f"Bearer {os.environ['BROK_API_KEY']}",
        "Content-Type": "application/json"
    },
    json={
        "model": "${model}",
        "messages": ${JSON.stringify(messages, null, 2)},
        "stream": ${stream}
    }
)

print(response.json())`

  const codex = `# Codex / OpenAI-compatible coding tools
export OPENAI_API_KEY="$BROK_API_KEY"
export OPENAI_BASE_URL="https://api.brok.ai/v1"
export OPENAI_MODEL="${model}"

# Use model "${model}" in your coding tool config.`

  const claude = `# Claude-style tools that support Anthropic-compatible endpoints
export ANTHROPIC_API_KEY="$BROK_API_KEY"
export ANTHROPIC_BASE_URL="https://api.brok.ai"
export ANTHROPIC_MODEL="${model}"

# Brok also supports POST /v1/messages with x-api-key.`

  async function copyToClipboard(text: string, id: string) {
    const copiedToClipboard = await safeCopyTextToClipboard(text)
    if (copiedToClipboard) {
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
      return
    }
    setCopied(null)
  }

  return (
    <Tabs defaultValue="curl" className="w-full">
      <TabsList className="h-9 w-full justify-start overflow-x-auto rounded-md">
        <TabsTrigger value="curl">curl</TabsTrigger>
        <TabsTrigger value="codex">Codex</TabsTrigger>
        <TabsTrigger value="claude">Claude</TabsTrigger>
        <TabsTrigger value="javascript">JavaScript</TabsTrigger>
        <TabsTrigger value="python">Python</TabsTrigger>
      </TabsList>

      <TabsContent value="curl" className="relative">
        <pre className="max-h-[320px] overflow-auto rounded-md bg-muted p-3 pr-11 text-xs leading-5 sm:text-sm">
          <code>{curl}</code>
        </pre>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2"
          onClick={() => copyToClipboard(curl, 'curl')}
        >
          {copied === 'curl' ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </TabsContent>

      <TabsContent value="codex" className="relative">
        <pre className="max-h-[320px] overflow-auto rounded-md bg-muted p-3 pr-11 text-xs leading-5 sm:text-sm">
          <code>{codex}</code>
        </pre>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2"
          onClick={() => copyToClipboard(codex, 'codex')}
        >
          {copied === 'codex' ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </TabsContent>

      <TabsContent value="claude" className="relative">
        <pre className="max-h-[320px] overflow-auto rounded-md bg-muted p-3 pr-11 text-xs leading-5 sm:text-sm">
          <code>{claude}</code>
        </pre>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2"
          onClick={() => copyToClipboard(claude, 'claude')}
        >
          {copied === 'claude' ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </TabsContent>

      <TabsContent value="javascript" className="relative">
        <pre className="max-h-[320px] overflow-auto rounded-md bg-muted p-3 pr-11 text-xs leading-5 sm:text-sm">
          <code>{javascript}</code>
        </pre>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2"
          onClick={() => copyToClipboard(javascript, 'js')}
        >
          {copied === 'js' ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </TabsContent>

      <TabsContent value="python" className="relative">
        <pre className="max-h-[320px] overflow-auto rounded-md bg-muted p-3 pr-11 text-xs leading-5 sm:text-sm">
          <code>{python}</code>
        </pre>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2"
          onClick={() => copyToClipboard(python, 'py')}
        >
          {copied === 'py' ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </TabsContent>
    </Tabs>
  )
}
