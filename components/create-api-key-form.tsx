'use client'

import { useState } from 'react'

import { CreateApiKeyInput } from '@/lib/actions/api-keys'

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

interface CreateApiKeyFormProps {
  action: (
    userId: string,
    workspaceId: string,
    input: CreateApiKeyInput
  ) => Promise<any>
  userId: string
  workspaceId: string
}

const AVAILABLE_MODELS = [
  { id: 'brok-lite', name: 'Brok Lite' },
  { id: 'brok-search', name: 'Brok Search' },
  { id: 'brok-search-pro', name: 'Brok Search Pro' },
  { id: 'brok-code', name: 'Brok Code' },
  { id: 'brok-agent', name: 'Brok Agent' },
  { id: 'brok-reasoning', name: 'Brok Reasoning' }
]

const AVAILABLE_SCOPES = [
  { id: 'chat:write', name: 'Chat Completions' },
  { id: 'search:write', name: 'Search Completions' },
  { id: 'code:write', name: 'Code Execution' },
  { id: 'agents:write', name: 'Agent Execution' },
  { id: 'usage:read', name: 'Read Usage' },
  { id: 'logs:read', name: 'Read Logs' }
]

export function CreateApiKeyForm({
  action,
  userId,
  workspaceId
}: CreateApiKeyFormProps) {
  const [name, setName] = useState('')
  const [environment, setEnvironment] = useState<'test' | 'live'>('test')
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['chat:write'])
  const [rpmLimit, setRpmLimit] = useState(60)
  const [dailyLimit, setDailyLimit] = useState(5000)
  const [createdKey, setCreatedKey] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const result = await action(userId, workspaceId, {
        name,
        environment,
        scopes: selectedScopes,
        allowedModels: selectedModels,
        rpmLimit,
        dailyRequestLimit: dailyLimit,
        monthlyBudgetCents: 0
      })
      setCreatedKey(result)
    } catch (error) {
      console.error('Failed to create key:', error)
    } finally {
      setLoading(false)
    }
  }

  function toggleModel(modelId: string) {
    setSelectedModels(prev =>
      prev.includes(modelId)
        ? prev.filter(m => m !== modelId)
        : [...prev, modelId]
    )
  }

  function toggleScope(scopeId: string) {
    setSelectedScopes(prev =>
      prev.includes(scopeId)
        ? prev.filter(s => s !== scopeId)
        : [...prev, scopeId]
    )
  }

  if (createdKey) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4 text-green-600">
          API Key Created!
        </h2>
        <div className="space-y-4">
          <div>
            <Label>Your API Key</Label>
            <div className="p-3 bg-muted rounded-lg font-mono text-sm break-all">
              {createdKey.key}
            </div>
          </div>
          <p className="text-sm text-yellow-600">
            Save this key now! You will not be able to see it again.
          </p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Name:</span>{' '}
              {createdKey.name}
            </div>
            <div>
              <span className="text-muted-foreground">Environment:</span>{' '}
              {createdKey.environment}
            </div>
            <div>
              <span className="text-muted-foreground">Rate Limit:</span>{' '}
              {createdKey.rpmLimit} RPM
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <Label htmlFor="name">Key Name</Label>
        <Input
          id="name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Production App"
          required
        />
      </div>

      <div>
        <Label htmlFor="environment">Environment</Label>
        <Select
          value={environment}
          onValueChange={v => setEnvironment(v as 'test' | 'live')}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="test">Test</SelectItem>
            <SelectItem value="live">Live</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Allowed Models</Label>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {AVAILABLE_MODELS.map(model => (
            <label
              key={model.id}
              className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={selectedModels.includes(model.id)}
                onChange={() => toggleModel(model.id)}
              />
              {model.name}
            </label>
          ))}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Leave unchecked to allow all models
        </p>
      </div>

      <div>
        <Label>Scopes</Label>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {AVAILABLE_SCOPES.map(scope => (
            <label
              key={scope.id}
              className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={selectedScopes.includes(scope.id)}
                onChange={() => toggleScope(scope.id)}
              />
              {scope.name}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="rpm">Requests Per Minute</Label>
          <Input
            id="rpm"
            type="number"
            value={rpmLimit}
            onChange={e => setRpmLimit(Number(e.target.value))}
            min={1}
            max={1000}
          />
        </div>
        <div>
          <Label htmlFor="daily">Daily Request Limit</Label>
          <Input
            id="daily"
            type="number"
            value={dailyLimit}
            onChange={e => setDailyLimit(Number(e.target.value))}
            min={1}
            max={100000}
          />
        </div>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create API Key'}
      </Button>
    </form>
  )
}
