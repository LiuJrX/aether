import type {
  AssistantMessage,
  AssistantMessageEvent,
  Message,
  ModelContext,
} from "../ai/index.js"
import type { ToolDefinition, ToolResult } from "../tools/index.js"
import type { ToolContext } from "../tools/types.js"

export type RuntimeBackend = "agent-core"

export type AgentEventHandler = (event: unknown) => void

export interface AgentSessionOptions {
  cwd?: string
  systemPrompt?: string
  timeoutSeconds?: number
  backend?: RuntimeBackend
  messages?: Message[]
}

export interface AgentSessionState {
  messages: Message[]
}

export interface AgentTool<
  TTool extends ToolDefinition = ToolDefinition,
> {
  name: string
  label: string
  description: string
  parameters: TTool["parameters"]
  execute: (
    toolCallId: string,
    params: unknown,
    signal?: AbortSignal,
    onUpdate?: unknown
  ) => Promise<{
    content: ToolResult["content"]
    details: unknown
    terminate?: boolean
  }>
}

export interface AgentState {
  model: ModelContext
  systemPrompt: string
  tools: AgentTool[]
  messages: Message[]
  toolContext: ToolContext
}

export interface ToolExecutionStartEvent {
  type: "tool_execution_start"
  toolName: string
  args: unknown
}

export interface ToolExecutionEndEvent {
  type: "tool_execution_end"
  toolName: string
  args: unknown
  result: ToolResult
  isError: boolean
}

export interface MessageUpdateEvent {
  type: "message_update"
  assistantMessageEvent: AssistantMessageEvent
}

export interface MessageEndEvent {
  type: "message_end"
  message: AssistantMessage
}

export type AgentEvent =
  | ToolExecutionStartEvent
  | ToolExecutionEndEvent
  | MessageUpdateEvent
  | MessageEndEvent

export interface AgentSession {
  prompt: (text: string) => Promise<void>
  getActiveToolNames: () => string[]
  getAllTools: () => Array<{ name: string }>
  setActiveToolsByName: (toolNames: string[]) => void
  setToolContext: (context: Partial<ToolContext>) => void
  subscribe: (listener: (event: AgentEvent) => void) => () => void
  dispose: () => void
  state: AgentSessionState
}

export interface AgentRuntime {
  createSession(options: AgentSessionOptions): Promise<AgentSession>
}
