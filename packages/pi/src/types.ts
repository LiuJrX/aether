import type { AetherRunEventHandler } from "@aether/observer"

export interface PiTaskOptions {
  prompt: string
  allowedTools?: string[]
  stageId?: string
  stageIndex: number
  stageDir: string
  cwd?: string
  workflowName: string
  runId: string
  onEvent?: AetherRunEventHandler
}

export interface PiTaskResult {
  output: string
  ok: boolean
  error?: string
}

export interface PiSessionOptions {
  cwd?: string
  runDir?: string
  sharedDir?: string
  systemPrompt?: string
  timeoutSeconds?: number
  workflowName: string
  runId: string
  onEvent?: AetherRunEventHandler
}

export interface PiSession {
  session: {
    prompt: (text: string) => Promise<void>
    getActiveToolNames: () => string[]
    getAllTools: () => Array<{ name: string }>
    setActiveToolsByName: (toolNames: string[]) => void
    state: {
      messages: unknown[]
    }
    subscribe: (listener: (event: unknown) => void) => () => void
    dispose: () => void
  }
  defaultToolNames: string[]
  workflowName: string
  currentStageId?: string
  currentStageIndex?: number
  currentStageDir?: string
  currentTurnIndex: number
  currentToolCallIndex: number
  currentTurnOpen: boolean
}
