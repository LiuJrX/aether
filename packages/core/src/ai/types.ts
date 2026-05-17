export interface ModelConfig {
  apiKey: string
  baseUrl: string
  model: string
  timeoutSeconds?: number
}

export interface ProviderConfig {
  apiKey: string
  baseUrl: string
  timeoutMs?: number
}

export interface TextContent {
  type: "text"
  text: string
}

export interface ToolCallContent {
  type: "toolCall"
  id: string
  toolName: string
  args: string
}

export type AssistantContent = TextContent | ToolCallContent

export interface UserMessage {
  role: "user"
  content: TextContent[]
}

export interface AssistantMessage {
  role: "assistant"
  content: AssistantContent[]
  stopReason?: "stop" | "tool_calls" | "error" | "aborted"
  errorMessage?: string
}

export interface ToolResultMessage {
  role: "tool"
  toolCallId: string
  toolName: string
  content: TextContent[]
  isError?: boolean
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage

export interface ProviderTool {
  name: string
  description: string
  parameters: unknown
}

export interface TextDeltaEvent {
  type: "text_delta"
  delta: string
}

export interface ToolCallDeltaEvent {
  type: "tool_call_delta"
  index: number
  id?: string
  toolName?: string
  argsDelta?: string
}

export type AssistantMessageEvent = TextDeltaEvent | ToolCallDeltaEvent

export interface StreamRequest {
  model: ModelConfig
  systemPrompt?: string
  messages: Message[]
  tools?: ProviderTool[]
  signal?: AbortSignal
  onEvent?: (event: AssistantMessageEvent) => void
}

export interface Provider {
  stream(request: StreamRequest): Promise<AssistantMessage>
}

export interface ModelContext {
  modelConfig: ModelConfig
  providerConfig: ProviderConfig
  provider: Provider
}
