import type {
  AssistantMessage,
  Message,
  ToolCallContent,
  ToolResultMessage,
} from "../ai/index.js"
import type { ToolResult } from "../tools/index.js"
import type { AgentEvent, AgentState } from "./types.js"

function parseToolArguments(args: string): unknown {
  try {
    return JSON.parse(args)
  } catch {
    return {}
  }
}

function createErrorResult(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : "Unknown tool error"
  return {
    content: [{ type: "text", text: message }],
    details: { error: message },
  }
}

function toToolResultMessage(
  toolCall: ToolCallContent,
  result: ToolResult,
  isError: boolean
): ToolResultMessage {
  return {
    role: "tool",
    toolCallId: toolCall.id,
    toolName: toolCall.toolName,
    content: result.content,
    isError,
  }
}

export async function runAgentLoop(options: {
  state: AgentState
  signal: AbortSignal
  emit: (event: AgentEvent) => void
  maxTurns?: number
}): Promise<void> {
  const maxTurns = options.maxTurns ?? 24

  for (let turn = 0; turn < maxTurns; turn += 1) {
    if (options.signal.aborted) {
      return
    }

    const assistantMessage = await options.state.model.provider.stream({
      model: options.state.model.modelConfig,
      systemPrompt: options.state.systemPrompt,
      messages: options.state.messages,
      tools: options.state.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
      signal: options.signal,
      onEvent: (assistantMessageEvent) => {
        options.emit({
          type: "message_update",
          assistantMessageEvent,
        })
      },
    })

    options.state.messages = [...options.state.messages, assistantMessage]
    options.emit({
      type: "message_end",
      message: assistantMessage,
    })

    const toolCalls = assistantMessage.content.filter(
      (item): item is ToolCallContent => item.type === "toolCall"
    )

    if (toolCalls.length === 0) {
      return
    }

    for (const toolCall of toolCalls) {
      const tool = options.state.tools.find(
        (candidate) => candidate.name === toolCall.toolName
      )
      const args = parseToolArguments(toolCall.args)

      options.emit({
        type: "tool_execution_start",
        toolName: toolCall.toolName,
        args,
      })

      let result: ToolResult
      let isError = false

      if (!tool) {
        isError = true
        result = createErrorResult(
          new Error(`Tool "${toolCall.toolName}" is not registered`)
        )
      } else {
        try {
          const executed = await tool.execute(
            toolCall.id,
            args,
            options.signal,
            undefined
          )
          result = {
            content: executed.content,
            details: executed.details,
          }
        } catch (error) {
          isError = true
          result = createErrorResult(error)
        }
      }

      options.emit({
        type: "tool_execution_end",
        toolName: toolCall.toolName,
        args,
        result,
        isError,
      })

      options.state.messages = [
        ...options.state.messages,
        toToolResultMessage(toolCall, result, isError),
      ]
    }
  }
}
