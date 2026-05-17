import type { AetherRunEventHandler } from "@aether/observer"

export interface WorkflowDefinition {
  name: string
  description?: string
  stages: WorkflowStageDefinition[]
}

export interface WorkflowStageDefinition {
  id: string
  prompt: string
  tools?: string[]
}

export interface WorkflowRunOptions {
  variables?: Record<string, unknown>
  cwd?: string
  runId?: string
  workflowName?: string
  runDir?: string
  sharedDir?: string
  onEvent?: AetherRunEventHandler
}

export interface WorkflowRunResult {
  name: string
  ok: boolean
  stages: WorkflowStageResult[]
}

export interface WorkflowStageResult {
  id: string
  ok: boolean
  output: string
  error?: string
}
