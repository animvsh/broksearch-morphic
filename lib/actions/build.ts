'use server'

import { classifyApp } from '@/lib/build/app-types'
import { buildInternalPlan, buildUserVisiblePlan } from '@/lib/build/plan'
import { runBuildStream } from '@/lib/build/stream'
import type {
  BrokStreamEvent,
  ClassifiedApp,
  InternalPlan,
  UserVisiblePlan
} from '@/lib/build/types'

export type PlanRequest = {
  prompt: string
}

export type PlanResponse = {
  classification: ClassifiedApp
  userPlan: UserVisiblePlan
  internalPlan: InternalPlan
}

function newProjectId() {
  const random = Math.random().toString(36).slice(2, 8)
  return `brok-${Date.now().toString(36)}-${random}`
}

export async function generateBrokBuildPlan(
  input: PlanRequest
): Promise<PlanResponse> {
  const classification = classifyApp(input.prompt)
  const { plan: internalPlan } = buildInternalPlan(input.prompt, classification)
  const userPlan = buildUserVisiblePlan(input.prompt, internalPlan)
  return { classification, userPlan, internalPlan }
}

export async function startBrokBuild(input: {
  prompt: string
  projectId?: string
  emit?: (event: BrokStreamEvent) => void
  signal?: AbortSignal
}) {
  const projectId = input.projectId ?? newProjectId()
  return runBuildStream({
    prompt: input.prompt,
    projectId,
    emit: input.emit,
    signal: input.signal
  })
}

export async function newBrokBuildProjectId() {
  return newProjectId()
}
