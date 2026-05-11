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

const PROVIDER_LOGO_BY_ID: Record<string, string> = {
  openai: '/providers/logos/openai.svg',
  anthropic: '/providers/logos/anthropic.svg',
  google: '/providers/logos/google.svg',
  gateway: '/providers/logos/gateway.svg',
  'openai-compatible': '/providers/logos/openai-compatible.svg',
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
}

export function ModelSelectorClient({ data }: ModelSelectorClientProps) {
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
        className="h-9 gap-1 rounded-full border-zinc-200 bg-white px-3 py-2 text-sm shadow-xs transition-all"
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
          className="h-9 gap-1 rounded-full border-zinc-200 bg-white px-3 py-2 text-sm shadow-xs transition-all hover:border-zinc-300 hover:bg-zinc-50"
        >
          <ProviderLogo providerId={selectedModel.providerId} />
          <span className="truncate max-w-40 text-xs font-medium">
            {selectedModel.name}
          </span>
          <ChevronDown
            className={cn(
              'h-3 w-3 ml-0.5 opacity-50 transition-transform duration-200',
              open && 'rotate-180'
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="end" sideOffset={6}>
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
                      value={`${value} ${model.name} ${model.description ?? ''} ${provider}`}
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
