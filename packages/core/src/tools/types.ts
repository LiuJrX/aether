import type { Static, TSchema } from "typebox"

export interface TextToolContent {
  type: "text"
  text: string
}

export type ToolContent = TextToolContent

export interface ToolResult<TDetails = unknown> {
  content: ToolContent[]
  details?: TDetails
}

export type ToolUpdateCallback = (update: unknown) => void

export interface ToolContext {
  cwd: string
  baseDir?: string
  sharedDir?: string
  model?: unknown
}

export interface ToolDefinition<
  TParams extends TSchema = TSchema,
  TDetails = unknown,
> {
  name: string
  label?: string
  description: string
  parameters: TParams
  execute: (
    toolCallId: string,
    params: Static<TParams>,
    signal?: AbortSignal,
    onUpdate?: ToolUpdateCallback,
    ctx?: ToolContext
  ) => Promise<ToolResult<TDetails>>
}
