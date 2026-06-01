'use client'

import { useCallback, useState } from 'react'

import type { ReasoningPart } from '@ai-sdk/provider-utils'
import { UseChatHelpers } from '@ai-sdk/react'
import {
  AlertCircle,
  Check,
  ChevronDown,
  Loader2,
  Waypoints
} from 'lucide-react'

import type { ToolPart, UIDataTypes, UIMessage, UITools } from '@/lib/types/ai'
import type { DynamicToolPart } from '@/lib/types/dynamic-tools'
import { cn } from '@/lib/utils'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from './ui/collapsible'
import { ReasoningSection } from './reasoning-section'
import { ToolSection } from './tool-section'

// Message part types
type TextPart = {
  type: 'text'
  text: string
}

type MessagePart = ReasoningPart | ToolPart | TextPart | DynamicToolPart

type ResearchProgressStatus = 'pending' | 'active' | 'done' | 'error'

type ResearchProgressStep = {
  id: string
  label: string
  detail?: string
  status: ResearchProgressStatus
}

// Type guards
function isReasoningPart(part: MessagePart): part is ReasoningPart {
  return part.type === 'reasoning'
}

function isToolPart(part: MessagePart): part is ToolPart {
  return (
    (part.type?.startsWith?.('tool-') && part.type !== 'dynamic-tool') ?? false
  )
}

function isTextPart(part: MessagePart): part is TextPart {
  return part.type === 'text'
}

function isNonEmptyTextPart(part: MessagePart): part is TextPart {
  return isTextPart(part) && part.text.trim().length > 0
}

function isRenderablePart(part: MessagePart): boolean {
  if (isReasoningPart(part) || isTextPart(part)) {
    return part.text.trim().length > 0
  }
  return true
}

function isSearchPart(part: MessagePart): part is ToolPart<'search'> {
  return isToolPart(part) && part.type === 'tool-search'
}

function isFetchPart(part: MessagePart): part is ToolPart<'fetch'> {
  return isToolPart(part) && part.type === 'tool-fetch'
}

function isPartRunning(part: ToolPart) {
  return (
    part.state === 'input-streaming' ||
    part.state === 'input-available' ||
    (part.type === 'tool-search' && (part.output as any)?.state === 'searching')
  )
}

function countSearchSources(parts: MessagePart[]) {
  return parts.reduce((count, part) => {
    if (!isSearchPart(part) || part.state !== 'output-available') return count

    const output = part.output as any
    if (output?.state !== 'complete') return count

    return (
      count +
      (output.results?.length ?? 0) +
      (output.videos?.length ?? 0) +
      (output.images?.length ?? 0)
    )
  }, 0)
}

function hasCitationText(parts: MessagePart[]) {
  return parts.some(
    part =>
      isTextPart(part) &&
      (/\[\d+\]\(#/.test(part.text) || /\[\d+\]\(https?:\/\//.test(part.text))
  )
}

function hasSpecBlock(parts: MessagePart[]) {
  return parts.some(part => isTextPart(part) && /```spec/.test(part.text))
}

export function getResearchProgressSteps({
  allParts,
  visibleParts,
  status,
  hasSubsequentText
}: {
  allParts: MessagePart[]
  visibleParts: MessagePart[]
  status?: UseChatHelpers<UIMessage<unknown, UIDataTypes, UITools>>['status']
  hasSubsequentText: boolean
}): ResearchProgressStep[] {
  const researchParts = allParts.filter(
    part => isSearchPart(part) || isFetchPart(part)
  )
  const visibleResearchParts = visibleParts.filter(
    part => isSearchPart(part) || isFetchPart(part)
  )

  if (researchParts.length === 0 && visibleResearchParts.length === 0) {
    return []
  }

  const sourceCount = countSearchSources(allParts)
  const hasSearch = researchParts.some(isSearchPart)
  const hasFetch = researchParts.some(isFetchPart)
  const hasError = researchParts.some(
    part =>
      isToolPart(part) &&
      (part.state === 'output-error' || Boolean((part.output as any)?.error))
  )
  const hasRunningSearch = researchParts.some(
    part => isSearchPart(part) && isPartRunning(part)
  )
  const hasRunningFetch = researchParts.some(
    part => isFetchPart(part) && isPartRunning(part)
  )
  const hasCompleteSearch = researchParts.some(
    part =>
      isSearchPart(part) &&
      part.state === 'output-available' &&
      (part.output as any)?.state === 'complete'
  )
  const hasCompleteFetch = researchParts.some(
    part => isFetchPart(part) && part.state === 'output-available'
  )
  const isStreaming = status === 'submitted' || status === 'streaming'
  const answerStarted = hasSubsequentText || allParts.some(isNonEmptyTextPart)
  const citationsAdded = sourceCount > 0 && hasCitationText(allParts)
  const followUpsReady = hasSpecBlock(allParts)

  const searchStatus: ResearchProgressStatus = hasError
    ? 'error'
    : hasRunningSearch
      ? 'active'
      : hasCompleteSearch || !hasSearch
        ? 'done'
        : 'pending'
  const readingStatus: ResearchProgressStatus =
    hasRunningFetch || (hasRunningSearch && sourceCount === 0)
      ? 'active'
      : hasCompleteFetch || sourceCount > 0
        ? 'done'
        : hasSearch
          ? 'pending'
          : 'done'
  const qualityStatus: ResearchProgressStatus =
    hasError && sourceCount === 0
      ? 'error'
      : sourceCount > 0 || hasCompleteSearch
        ? 'done'
        : hasRunningSearch
          ? 'pending'
          : 'done'
  const writingStatus: ResearchProgressStatus = answerStarted
    ? isStreaming
      ? 'active'
      : 'done'
    : researchParts.some(part => isPartRunning(part as ToolPart))
      ? 'pending'
      : 'active'
  const citationStatus: ResearchProgressStatus = citationsAdded
    ? 'done'
    : sourceCount > 0 && answerStarted
      ? 'active'
      : sourceCount > 0
        ? 'pending'
        : hasError
          ? 'error'
          : 'pending'
  const followUpsStatus: ResearchProgressStatus = followUpsReady
    ? 'done'
    : answerStarted && isStreaming
      ? 'active'
      : answerStarted
        ? 'pending'
        : 'pending'

  return [
    { id: 'understand', label: 'Understanding question', status: 'done' },
    {
      id: 'search',
      label: 'Searching web',
      detail:
        sourceCount > 0
          ? `Found ${sourceCount} source${sourceCount === 1 ? '' : 's'}`
          : undefined,
      status: searchStatus
    },
    {
      id: 'read',
      label: hasFetch ? 'Reading pages' : 'Reading sources',
      status: readingStatus
    },
    {
      id: 'quality',
      label: 'Checking source quality',
      status: qualityStatus
    },
    { id: 'write', label: 'Writing answer', status: writingStatus },
    { id: 'citations', label: 'Adding citations', status: citationStatus },
    { id: 'followups', label: 'Generating follow-ups', status: followUpsStatus }
  ]
}

type Props = {
  message: UIMessage
  messageId: string
  getIsOpen: (id: string, partType?: string, hasNextPart?: boolean) => boolean
  onOpenChange: (id: string, open: boolean) => void
  status?: UseChatHelpers<UIMessage<unknown, UIDataTypes, UITools>>['status']
  addToolResult?: (params: { toolCallId: string; result: any }) => void
  parts?: MessagePart[]
  hasSubsequentText?: boolean
}

/**
 * Splits message parts into segments, where each segment contains
 * non-text parts between text parts
 * @param parts - Array of message parts to split
 * @returns Array of segments (arrays of non-text parts)
 */
function splitByText(parts: MessagePart[]): MessagePart[][] {
  const segments: MessagePart[][] = []
  let currentSegment: MessagePart[] = []

  for (const part of parts || []) {
    if (isNonEmptyTextPart(part)) {
      // When we hit a text part, save the current segment if it has content
      if (currentSegment.length > 0) {
        segments.push(currentSegment)
        currentSegment = []
      }
    } else {
      // Accumulate non-text parts
      currentSegment.push(part)
    }
  }

  // Don't forget the last segment
  if (currentSegment.length > 0) {
    segments.push(currentSegment)
  }

  return segments
}

/**
 * Groups consecutive tool parts of the same type together
 * @param segment - Array of message parts within a segment
 * @returns Array of grouped parts
 */
function groupConsecutiveParts(segment: MessagePart[]): MessagePart[][] {
  if (segment.length === 0) return []

  const groups: MessagePart[][] = []
  let currentIndex = 0

  while (currentIndex < segment.length) {
    const currentPart = segment[currentIndex]

    if (isToolPart(currentPart)) {
      // Group consecutive tool parts of the same type
      const toolGroup = [currentPart]
      const toolType = currentPart.type

      let nextIndex = currentIndex + 1
      while (
        nextIndex < segment.length &&
        segment[nextIndex].type === toolType
      ) {
        toolGroup.push(segment[nextIndex] as ToolPart)
        nextIndex++
      }

      groups.push(toolGroup)
      currentIndex = nextIndex
    } else {
      // Non-tool parts stay as single-item groups
      groups.push([currentPart])
      currentIndex++
    }
  }

  return groups
}

/**
 * Custom hook for managing accordion state in grouped sections
 */
function useAccordionState(onOpenChange: (id: string, open: boolean) => void) {
  const [openSectionId, setOpenSectionId] = useState<string | null>(null)

  const handleAccordionChange = useCallback(
    (id: string, open: boolean, isSingle: boolean) => {
      if (isSingle) {
        // For single sections, use the original behavior
        onOpenChange(id, open)
      } else {
        // For grouped sections, implement accordion behavior
        if (open) {
          setOpenSectionId(id)
        } else {
          setOpenSectionId(null)
        }
        // Still notify parent for tracking purposes
        onOpenChange(id, open)
      }
    },
    [onOpenChange]
  )

  return { openSectionId, handleAccordionChange }
}

/**
 * Renders a single part (reasoning, tool, or data)
 */
function RenderPart({
  part,
  partId,
  hasNext,
  hasSubsequentContent,
  isSingle,
  isFirstGroup,
  isLastGroup,
  groupLength,
  partIndex,
  getIsOpen,
  openSectionId,
  handleAccordionChange,
  status,
  addToolResult
}: {
  part: MessagePart
  partId: string
  hasNext: boolean
  hasSubsequentContent: boolean
  isSingle: boolean
  isFirstGroup: boolean
  isLastGroup: boolean
  groupLength: number
  partIndex: number
  getIsOpen: (id: string, partType?: string, hasNextPart?: boolean) => boolean
  openSectionId: string | null
  handleAccordionChange: (id: string, open: boolean, isSingle: boolean) => void
  status?: any
  addToolResult?: (params: { toolCallId: string; result: any }) => void
}) {
  const hasSubsequent = hasNext || hasSubsequentContent

  if (isReasoningPart(part)) {
    const isOpen = isSingle
      ? getIsOpen(partId, 'reasoning', hasSubsequent)
      : openSectionId === partId

    return (
      <ReasoningSection
        content={{ reasoning: part.text, isDone: !hasNext }}
        isOpen={isOpen}
        onOpenChange={open => handleAccordionChange(partId, open, isSingle)}
        isSingle={isSingle}
        isFirst={isFirstGroup && partIndex === 0}
        isLast={isLastGroup && partIndex === groupLength - 1}
      />
    )
  }

  if (isToolPart(part)) {
    const isOpen = isSingle
      ? getIsOpen(part.toolCallId, part.type, hasSubsequent)
      : openSectionId === part.toolCallId

    return (
      <ToolSection
        tool={part}
        isOpen={isOpen}
        onOpenChange={open =>
          handleAccordionChange(part.toolCallId, open, isSingle)
        }
        status={status}
        addToolResult={addToolResult}
        borderless={!isSingle}
        isFirst={isFirstGroup && partIndex === 0}
        isLast={isLastGroup && partIndex === groupLength - 1}
      />
    )
  }

  return null
}

function ResearchProgressTimeline({
  steps
}: {
  steps: ResearchProgressStep[]
}) {
  if (steps.length === 0) return null

  return (
    <div
      className="rounded-lg border bg-card/70 px-3 py-2.5"
      data-testid="research-progress"
      aria-label="Research progress"
    >
      <div className="space-y-1.5">
        {steps.map(step => {
          const Icon =
            step.status === 'done'
              ? Check
              : step.status === 'error'
                ? AlertCircle
                : Loader2
          const isActive = step.status === 'active'
          const isPending = step.status === 'pending'

          return (
            <div
              key={step.id}
              className={cn(
                'flex min-h-6 items-center gap-2 text-sm transition-colors',
                isPending ? 'text-muted-foreground/60' : 'text-foreground'
              )}
            >
              <span
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center rounded-full',
                  step.status === 'done' &&
                    'bg-emerald-500/10 text-emerald-600',
                  step.status === 'error' &&
                    'bg-destructive/10 text-destructive',
                  isActive && 'bg-primary/10 text-primary',
                  isPending && 'bg-muted text-muted-foreground'
                )}
              >
                <Icon className={cn('size-3', isActive && 'animate-spin')} />
              </span>
              <span className="min-w-0 flex-1 truncate">{step.label}</span>
              {step.detail && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {step.detail}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Determines if there's content after a given segment
 * @param segmentIndex - The index of the current segment
 * @param segments - All segments
 * @param messageParts - Original message parts
 * @returns true if there's subsequent content
 */
function useHasSubsequentContent(
  segments: MessagePart[][],
  messageParts: MessagePart[] | undefined
) {
  return useCallback(
    (segmentIndex: number): boolean => {
      // Check if there are more segments after this one
      if (segmentIndex < segments.length - 1) {
        return true
      }

      // Check if there are text parts after the last segment in the original message parts
      const lastSegment = segments[segmentIndex]
      if (!lastSegment || lastSegment.length === 0) {
        return false
      }

      const lastPartInSegment = lastSegment[lastSegment.length - 1]
      const remainingParts =
        messageParts?.slice(
          messageParts.findIndex(p => p === lastPartInSegment) + 1
        ) || []

      return remainingParts.some(p => isTextPart(p))
    },
    [segments, messageParts]
  )
}

export function ResearchProcessSection({
  message,
  messageId,
  getIsOpen,
  onOpenChange,
  status,
  addToolResult,
  parts: partsOverride,
  hasSubsequentText = false
}: Props) {
  const allParts = (partsOverride ?? (message.parts || [])) as MessagePart[]

  // Filter out empty reasoning/text parts to avoid incorrect grouping
  const filteredParts = allParts.filter(isRenderablePart)
  const filteredMessageParts = ((message.parts || []) as MessagePart[]).filter(
    isRenderablePart
  )
  const progressSteps = getResearchProgressSteps({
    allParts: filteredMessageParts,
    visibleParts: filteredParts,
    status,
    hasSubsequentText
  })

  const segments = partsOverride ? [filteredParts] : splitByText(filteredParts)

  // Use custom hook for accordion state management
  const { openSectionId, handleAccordionChange } =
    useAccordionState(onOpenChange)

  // Use custom hook for subsequent content detection
  const hasSubsequentContent = useHasSubsequentContent(
    segments,
    filteredMessageParts
  )

  // State for parent collapsible (when segment has 5+ parts)
  // Auto-collapse when text generation starts (hasSubsequentText is true)
  const [parentOpenStates, setParentOpenStates] = useState<
    Record<string, boolean>
  >({})

  if (segments.length === 0 || segments.every(seg => seg.length === 0))
    return null

  return (
    <div className="space-y-2" data-testid="research-process">
      <ResearchProgressTimeline steps={progressSteps} />
      {segments.map((seg, sidx) => {
        const groups = groupConsecutiveParts(seg)
        const isSingle = groups.length === 1 && groups[0].length === 1
        const containerClass = cn(!isSingle && 'rounded-lg border bg-card')

        // Count total parts in this segment
        const totalParts = seg.length
        const needsParentCollapsible = totalParts >= 5

        // Parent collapsible ID
        const parentId = `${messageId}-parent-${sidx}`
        // If user has explicitly set state, use that; otherwise auto-collapse when text follows
        const isParentOpen =
          parentOpenStates[parentId] ?? (hasSubsequentText ? false : true)

        const segmentContent = (
          <div className={containerClass}>
            {groups.map((grp, gidx) => (
              <div key={`${messageId}-grp-${sidx}-${gidx}`}>
                {grp.map((part, pidx) => {
                  const partId = isToolPart(part)
                    ? part.toolCallId
                    : `${messageId}-${part.type}-${sidx}-${gidx}-${pidx}`

                  return (
                    <RenderPart
                      key={partId}
                      part={part}
                      partId={partId}
                      hasNext={pidx < grp.length - 1}
                      hasSubsequentContent={hasSubsequentContent(sidx)}
                      isSingle={isSingle}
                      isFirstGroup={gidx === 0}
                      isLastGroup={gidx === groups.length - 1}
                      groupLength={grp.length}
                      partIndex={pidx}
                      getIsOpen={getIsOpen}
                      openSectionId={openSectionId}
                      handleAccordionChange={handleAccordionChange}
                      status={status}
                      addToolResult={addToolResult}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        )

        if (needsParentCollapsible) {
          return (
            <Collapsible
              key={`${messageId}-seg-${sidx}`}
              open={isParentOpen}
              onOpenChange={open => {
                setParentOpenStates(prev => ({ ...prev, [parentId]: open }))
              }}
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex items-center px-1 py-0.5 gap-2 text-sm rounded-lg group"
                >
                  <Waypoints className="size-4 text-muted-foreground group-hover:text-muted-foreground/70" />
                  <span className="font-medium text-muted-foreground group-hover:text-muted-foreground/70">
                    Research Process ({totalParts} steps)
                  </span>
                  <ChevronDown
                    className={cn(
                      'size-4 text-muted-foreground group-hover:text-muted-foreground/70 transition-transform duration-200',
                      isParentOpen && 'rotate-180'
                    )}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="data-[state=closed]:animate-collapse-up data-[state=open]:animate-collapse-down">
                <div className="pt-2">{segmentContent}</div>
              </CollapsibleContent>
            </Collapsible>
          )
        }

        return <div key={`${messageId}-seg-${sidx}`}>{segmentContent}</div>
      })}
    </div>
  )
}

export default ResearchProcessSection
