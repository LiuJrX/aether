function pad(value: number, length: number): string {
  return String(value).padStart(length, "0")
}

export interface AetherRunEventBase {
  type: AetherRunEvent["type"]
  runId: string
  timestamp: string
}

export interface SessionCreatedEvent extends AetherRunEventBase {
  type: "session.created"
  workflowName: string
  cwd: string
  remoteToolCount: number
  remoteTools: string[]
}

export interface WorkflowStartedEvent extends AetherRunEventBase {
  type: "workflow.started"
  workflowName: string
  stageCount: number
}

export interface WorkflowFinishedEvent extends AetherRunEventBase {
  type: "workflow.finished"
  workflowName: string
  ok: boolean
}

export interface StageStartedEvent extends AetherRunEventBase {
  type: "stage.started"
  workflowName: string
  stageIndex: number
  stageId: string
  tools: string[]
}

export interface StageToolsActivatedEvent extends AetherRunEventBase {
  type: "stage.tools.activated"
  workflowName: string
  stageIndex: number
  stageId: string
  declaredTools: string[]
  tools: string[]
}

export interface StageTurnStartedEvent extends AetherRunEventBase {
  type: "stage.turn.started"
  workflowName: string
  stageIndex: number
  stageId: string
  turnIndex: number
}

export interface StageTurnCompletedEvent extends AetherRunEventBase {
  type: "stage.turn.completed"
  workflowName: string
  stageIndex: number
  stageId: string
  turnIndex: number
  assistantText: string
}

export interface StageFinishedEvent extends AetherRunEventBase {
  type: "stage.finished"
  workflowName: string
  stageIndex: number
  stageId: string
  ok: boolean
  outputPreview: string
  error?: string
}

export interface ToolStartedEvent extends AetherRunEventBase {
  type: "tool.started"
  workflowName: string
  stageIndex: number
  stageId: string
  turnIndex: number
  toolCallIndex: number
  toolName: string
  args: Record<string, unknown>
  argsPreview: string
}

export interface ToolFinishedEvent extends AetherRunEventBase {
  type: "tool.finished"
  workflowName: string
  stageIndex: number
  stageId: string
  turnIndex: number
  toolCallIndex: number
  toolName: string
  isError: boolean
  resultPreview?: string
}

export interface AssistantDeltaEvent extends AetherRunEventBase {
  type: "assistant.delta"
  workflowName: string
  stageIndex: number
  stageId: string
  turnIndex: number
  delta: string
}

export interface AssistantCompletedEvent extends AetherRunEventBase {
  type: "assistant.completed"
  workflowName: string
  stageIndex: number
  stageId: string
  turnIndex: number
  text: string
}

export type AetherRunEvent =
  | SessionCreatedEvent
  | WorkflowStartedEvent
  | WorkflowFinishedEvent
  | StageStartedEvent
  | StageToolsActivatedEvent
  | StageTurnStartedEvent
  | StageTurnCompletedEvent
  | StageFinishedEvent
  | ToolStartedEvent
  | ToolFinishedEvent
  | AssistantDeltaEvent
  | AssistantCompletedEvent

export type AetherRunEventHandler = (event: AetherRunEvent) => void

type EventPayload<T extends AetherRunEvent["type"]> = Omit<
  Extract<AetherRunEvent, { type: T }>,
  "type" | "runId" | "timestamp"
>

export interface AetherEventBus {
  emit<T extends AetherRunEvent["type"]>(
    type: T,
    payload: EventPayload<T>
  ): void
  publish(event: AetherRunEvent): void
  subscribe(handler: AetherRunEventHandler): () => void
}

export function createRunId(): string {
  const now = new Date()
  const timestamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1, 2),
    pad(now.getDate(), 2),
    pad(now.getHours(), 2),
    pad(now.getMinutes(), 2),
    pad(now.getSeconds(), 2),
  ].join("")
  const randomSuffix = pad(Math.floor(Math.random() * 10_000), 4)

  return `${timestamp}${randomSuffix}`
}

export function createEventBus(
  runId: string = createRunId(),
  initialHandler?: AetherRunEventHandler
): AetherEventBus & { runId: string } {
  const listeners = new Set<AetherRunEventHandler>()

  if (initialHandler) {
    listeners.add(initialHandler)
  }

  return {
    runId,
    emit(type, payload) {
      const event = {
        type,
        runId,
        timestamp: new Date().toISOString(),
        ...payload,
      } as unknown as AetherRunEvent

      for (const listener of listeners) {
        listener(event)
      }
    },
    publish(event) {
      const normalizedEvent =
        event.runId === runId
          ? event
          : {
              ...event,
              runId,
            }

      for (const listener of listeners) {
        listener(normalizedEvent)
      }
    },
    subscribe(handler) {
      listeners.add(handler)
      return () => {
        listeners.delete(handler)
      }
    },
  }
}
