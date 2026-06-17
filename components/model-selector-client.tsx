'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'

import { Check, ChevronDown } from 'lucide-react'

import {
  MODEL_SELECTION_COOKIE,
  serializeModelSelectionCookie
} from '@/lib/config/model-selection-cookie'
import { ModelSelectorData } from '@/lib/types/model-selector'
import { Model } from '@/lib/types/models'
import { cn } from '@/lib/utils'
import { setCookie } from '@/lib/utils/cookies'

import { Button } from './ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from './ui/command'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

function modelKey(model: Model): string {
  return `${model.providerId}:${model.id}`
}

function modelAlias(model: Model): string {
  return model.alias ?? model.id
}

const PROVIDER_LOGO_BY_ID: Record<string, string> = {
  openai: '/providers/logos/openai.svg',
  anthropic: '/providers/logos/anthropic.svg',
  google: '/providers/logos/google.svg',
  gateway: '/providers/logos/gateway.svg',
  'openai-compatible': '/brand/brok-logo.png',
  ollama: '/providers/logos/ollama.svg'
}

const PROVIDER_LABEL_BY_ID: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  gateway: 'Gateway',
  'openai-compatible': 'Brok',
  ollama: 'Ollama'
}

function ProviderLogo({ providerId }: { providerId: string }) {
  const logoSrc = PROVIDER_LOGO_BY_ID[providerId]
  if (!logoSrc) {
    return <span className="size-4 rounded-full bg-muted-foreground/30" />
  }

  return (
    <Image
      src={logoSrc}
      alt={`${PROVIDER_LABEL_BY_ID[providerId] ?? 'Provider'} logo`}
      width={16}
      height={16}
      className="size-4 shrink-0 object-contain"
    />
  )
}

function formatContextWindow(contextWindow?: number) {
  return contextWindow ? contextWindow.toLocaleString('en-US') : null
}

interface ModelSelectorClientProps {
  data: ModelSelectorData
  compact?: boolean
}

export function ModelSelectorClient({
  data,
  compact = false
}: ModelSelectorClientProps) {
  const [open, setOpen] = useState(false)
  const [selectedModelKey, setSelectedModelKey] = useState<string>(
    data.selectedModelKey
  )

  const providerEntries = useMemo(
    () =>
      Object.entries(data.modelsByProvider).sort(([providerA], [providerB]) =>
        providerA.localeCompare(providerB)
      ),
    [data.modelsByProvider]
  )

  const selectableModels = useMemo(
    () => providerEntries.flatMap(([, models]) => models),
    [providerEntries]
  )

  const selectableByKey = useMemo(
    () =>
      Object.fromEntries(
        selectableModels.map(model => [modelKey(model), model])
      ) as Record<string, Model>,
    [selectableModels]
  )

  const selectedModel = selectableByKey[selectedModelKey]

  if (!data.enabled) {
    return null
  }

  if (!data.hasAvailableModels) {
    return (
      <Button
        variant="outline"
        className={cn(
          'h-9 gap-1 rounded-full border-zinc-200 bg-white px-3 py-2 text-sm shadow-xs transition-all',
          compact && 'max-w-[12rem] sm:max-w-56'
        )}
        disabled
        title="No enabled models are available"
      >
        <span className="truncate max-w-52 text-xs font-medium">
          No enabled model available
        </span>
      </Button>
    )
  }

  if (!selectedModel) {
    return null
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={`Answer model: ${selectedModel.name}`}
          className={cn(
            'h-9 gap-1 rounded-full border-zinc-200 bg-white px-3 py-2 text-sm shadow-xs transition-all hover:border-zinc-300 hover:bg-zinc-50',
            compact && 'max-w-[12rem] sm:max-w-56'
          )}
        >
          <ProviderLogo providerId={selectedModel.providerId} />
          <span className="max-w-28 truncate text-xs font-medium sm:max-w-40">
            {selectedModel.name}
          </span>
          <span className="hidden rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 sm:inline">
            {modelAlias(selectedModel)}
          </span>
          <ChevronDown
            className={cn(
              'h-3 w-3 ml-0.5 opacity-50 transition-transform duration-200',
              open && 'rotate-180'
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="end" sideOffset={6}>
        <div className="border-b border-zinc-100 px-3 py-2.5">
          <div className="text-xs font-semibold text-zinc-900">
            Available models
          </div>
          <div className="mt-1 truncate font-mono text-[11px] text-zinc-500">
            {selectableModels.map(modelAlias).join(' · ')}
          </div>
        </div>
        <Command>
          <CommandInput placeholder="Search models..." />
          <CommandList>
            <CommandEmpty>No model found.</CommandEmpty>
            {providerEntries.map(([provider, models]) => (
              <CommandGroup key={provider} heading={provider}>
                {models.map(model => {
                  const value = modelKey(model)
                  const isSelected = selectedModelKey === value
                  return (
                    <CommandItem
                      key={value}
                      value={`${value} ${modelAlias(model)} ${model.name} ${model.description ?? ''} ${provider}`}
                      onSelect={() => {
                        const nextModel = selectableByKey[value]
                        if (!nextModel) {
                          return
                        }

                        setSelectedModelKey(value)
                        setCookie(
                          MODEL_SELECTION_COOKIE,
                          serializeModelSelectionCookie({
                            providerId: nextModel.providerId,
                            modelId: nextModel.id
                          })
                        )
                        setOpen(false)
                      }}
                      className="cursor-pointer items-start gap-2 py-2"
                    >
                      <Check
                        className={cn(
                          'mt-0.5 h-4 w-4',
                          isSelected ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <span className="mt-0.5">
                        <ProviderLogo providerId={model.providerId} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-medium">
                            {model.name}
                          </span>
                          <span className="shrink-0 rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                            {modelAlias(model)}
                          </span>
                          {model.speedLabel ? (
                            <span className="shrink-0 rounded-md border border-border/60 bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {model.speedLabel}
                            </span>
                          ) : null}
                        </span>
                        {model.description || model.contextWindow ? (
                          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                            {model.description}
                            {model.contextWindow ? (
                              <>
                                {model.description ? ' · ' : ''}
                                {formatContextWindow(model.contextWindow)} ctx
                              </>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
