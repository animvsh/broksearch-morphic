'use client'

import { useState } from 'react'

import { Check, Copy } from 'lucide-react'

import { safeCopyTextToClipboard } from '@/lib/utils/copy-to-clipboard'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface CodeSnippetProps {
  mode: 'chat' | 'search'
  model: string
  messages: Array<{ role: string; content: string }>
  query: string
  searchDepth: string
  stream: boolean
}

export function CodeSnippet({
  mode,
  model,
  messages,
  query,
  searchDepth,
  stream
}: CodeSnippetProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const endpoint =
    mode === 'search' ? '/v1/search/completions' : '/v1/chat/completions'
  const payload =
    mode === 'search'
      ? {
          model,
          query,
          search_depth: searchDepth,
          stream
        }
      : {
          model,
          messages,
          stream
        }
  const payloadJson = JSON.stringify(payload, null, 2)

  const curlCommand = stream ? 'curl -N' : 'curl'
  const curl = `${curlCommand} https://www.brok.fyi/api${endpoint} \\
  -H "Authorization: Bearer $BROK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${payloadJson}'`

  const javascriptJson = `const response = await fetch("https://www.brok.fyi/api${endpoint}", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.BROK_API_KEY}\`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(${payloadJson})
});

const data = await response.json();
console.log(data);`

  const javascriptStream = `const response = await fetch("https://www.brok.fyi/api${endpoint}", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.BROK_API_KEY}\`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(${payloadJson})
});

if (!response.body) {
  throw new Error("Streaming is not supported by this runtime.");
}

const decoder = new TextDecoder();
const reader = response.body.getReader();
let buffer = "";

while (true) {
  const { value, done } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\\n");
  buffer = lines.pop() ?? "";

  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;

    const data = line.slice(6).trim();
    if (data === "[DONE]") continue;

    console.log(JSON.parse(data));
  }
}`

  const pythonJson = `import json
import os
import requests

response = requests.post(
    "https://www.brok.fyi/api${endpoint}",
    headers={
        "Authorization": f"Bearer {os.environ['BROK_API_KEY']}",
        "Content-Type": "application/json"
    },
    json=json.loads('''${payloadJson}''')
)

print(response.json())`

  const pythonStream = `import json
import os
import requests

with requests.post(
    "https://www.brok.fyi/api${endpoint}",
    headers={
        "Authorization": f"Bearer {os.environ['BROK_API_KEY']}",
        "Content-Type": "application/json"
    },
    json=json.loads('''${payloadJson}'''),
    stream=True
) as response:
    response.raise_for_status()

    for line in response.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data: "):
            continue

        data = line.removeprefix("data: ").strip()
        if data == "[DONE]":
            continue

        print(json.loads(data))`

  const javascript = stream ? javascriptStream : javascriptJson
  const python = stream ? pythonStream : pythonJson

  const codex = `# Codex / OpenAI-compatible coding tools
export OPENAI_API_KEY="$BROK_API_KEY"
export OPENAI_BASE_URL="https://www.brok.fyi/api/v1"
export OPENAI_MODEL="${model}"

# Use model "${model}" in your coding tool config.`

  const claude = `# Claude-style tools that support Anthropic-compatible endpoints
export ANTHROPIC_API_KEY="$BROK_API_KEY"
export ANTHROPIC_BASE_URL="https://www.brok.fyi/api"
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
      <TabsList className="h-auto min-h-11 w-full justify-start overflow-x-auto rounded-md">
        <TabsTrigger value="curl" className="min-h-11">
          curl
        </TabsTrigger>
        <TabsTrigger value="codex" className="min-h-11">
          Codex
        </TabsTrigger>
        <TabsTrigger value="claude" className="min-h-11">
          Claude
        </TabsTrigger>
        <TabsTrigger value="javascript" className="min-h-11">
          JavaScript
        </TabsTrigger>
        <TabsTrigger value="python" className="min-h-11">
          Python
        </TabsTrigger>
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
