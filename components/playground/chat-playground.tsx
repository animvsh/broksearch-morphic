'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponseViewer } from './response-viewer';
import { CodeSnippet } from './code-snippet';
import { BROK_MODELS } from '@/lib/brok/models';

const MODELS = Object.entries(BROK_MODELS).map(([id, config]) => ({
  id,
  name: config.name,
  description: config.description,
}));

export function ChatPlayground() {
  const [selectedModel, setSelectedModel] = useState('brok-lite');
  const [systemMessage, setSystemMessage] = useState('You are a helpful assistant.');
  const [userMessage, setUserMessage] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1000);
  const [stream, setStream] = useState(true);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{ content: string; usage?: any; done: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!userMessage.trim()) return;

    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      // Get API key from localStorage (demo)
      const apiKey = localStorage.getItem('brok_demo_key') || 'demo';

      const res = await fetch('/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: userMessage },
          ],
          stream,
          temperature,
          max_tokens: maxTokens,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Request failed');
      }

      if (stream) {
        // Handle streaming
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';

        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          // Parse SSE lines
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.choices?.[0]?.delta?.content) {
                  fullContent += parsed.choices[0].delta.content;
                  setResponse({
                    content: fullContent,
                    done: false,
                  });
                }
              } catch {}
            }
          }
        }

        setResponse({ content: fullContent, done: true });
      } else {
        const data = await res.json();
        setResponse({
          content: data.choices?.[0]?.message?.content || '',
          usage: data.usage,
          done: true,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 grid grid-cols-2 gap-0">
      {/* Left Panel - Input */}
      <div className="border-r p-4 space-y-4 overflow-auto">
        <div>
          <Label>Model</Label>
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            {MODELS.find((m) => m.id === selectedModel)?.description}
          </p>
        </div>

        <div>
          <Label htmlFor="system">System Message</Label>
          <Textarea
            id="system"
            value={systemMessage}
            onChange={(e) => setSystemMessage(e.target.value)}
            rows={3}
          />
        </div>

        <div>
          <Label htmlFor="user">User Message</Label>
          <Textarea
            id="user"
            value={userMessage}
            onChange={(e) => setUserMessage(e.target.value)}
            rows={5}
            placeholder="What would you like to ask Brok?"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="temp">Temperature</Label>
            <input
              id="temp"
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full"
            />
            <span className="text-sm">{temperature}</span>
          </div>
          <div>
            <Label htmlFor="maxTokens">Max Tokens</Label>
            <input
              id="maxTokens"
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="stream"
            checked={stream}
            onCheckedChange={setStream}
          />
          <Label htmlFor="stream">Stream Response</Label>
        </div>

        <Button onClick={handleSubmit} disabled={loading || !userMessage.trim()}>
          {loading ? 'Running...' : 'Run'}
        </Button>
      </div>

      {/* Right Panel - Output */}
      <div className="p-4 space-y-4 overflow-auto">
        <Card>
          <CardHeader>
            <CardTitle>Response</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponseViewer response={response} error={error} />
          </CardContent>
        </Card>

        {response && !error && (
          <Card>
            <CardHeader>
              <CardTitle>Code Snippets</CardTitle>
            </CardHeader>
            <CardContent>
              <CodeSnippet
                model={selectedModel}
                messages={[
                  { role: 'system', content: systemMessage },
                  { role: 'user', content: userMessage },
                ]}
                stream={stream}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
