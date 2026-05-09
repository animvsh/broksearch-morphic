'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';

interface CodeSnippetProps {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream: boolean;
}

export function CodeSnippet({ model, messages, stream }: CodeSnippetProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const curl = `curl https://api.brok.ai/v1/chat/completions \\
  -H "Authorization: Bearer $BROK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "messages": ${JSON.stringify(messages, null, 2)},
    "stream": ${stream}
  }'`;

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
console.log(data);`;

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

print(response.json())`;

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <Tabs defaultValue="curl" className="w-full">
      <TabsList>
        <TabsTrigger value="curl">curl</TabsTrigger>
        <TabsTrigger value="javascript">JavaScript</TabsTrigger>
        <TabsTrigger value="python">Python</TabsTrigger>
      </TabsList>

      <TabsContent value="curl" className="relative">
        <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
          <code>{curl}</code>
        </pre>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2"
          onClick={() => copyToClipboard(curl, 'curl')}
        >
          {copied === 'curl' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </TabsContent>

      <TabsContent value="javascript" className="relative">
        <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
          <code>{javascript}</code>
        </pre>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2"
          onClick={() => copyToClipboard(javascript, 'js')}
        >
          {copied === 'js' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </TabsContent>

      <TabsContent value="python" className="relative">
        <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
          <code>{python}</code>
        </pre>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2"
          onClick={() => copyToClipboard(python, 'py')}
        >
          {copied === 'py' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </TabsContent>
    </Tabs>
  );
}
