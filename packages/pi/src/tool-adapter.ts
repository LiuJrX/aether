import type {
  ToolContext,
  ToolDefinition as CoreToolDefinition,
} from "../../core/src/index.js"
import type { AgentTool } from "../../core/src/agent/index.js"

export function adaptToolFactoryToAgentTool(
  toolFactory: (ctx: ToolContext) => CoreToolDefinition,
  contextFactory: () => ToolContext
): AgentTool {
  const initialContext = contextFactory()
  const initialTool = toolFactory(initialContext)

  return {
    name: initialTool.name,
    label: initialTool.label ?? initialTool.name,
    description: initialTool.description,
    parameters: initialTool.parameters,
    async execute(
      toolCallId: string,
      params: unknown,
      signal?: AbortSignal,
      onUpdate?: unknown
    ) {
      const context = contextFactory()
      const tool = toolFactory(context)
      const normalizedParams =
        typeof params === "object" && params !== null
          ? (params as Record<string, unknown>)
          : {}
      const result = await tool.execute(
        toolCallId,
        normalizedParams,
        signal ?? new AbortController().signal,
        onUpdate as unknown as undefined,
        context
      )
      return {
        content: result.content,
        details: result.details ?? null,
        terminate: undefined,
      }
    },
  }
}
