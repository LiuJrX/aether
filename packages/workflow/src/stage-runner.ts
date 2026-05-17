import { createEventBus } from "@aether/observer"
import {
  createToolRegistry,
  type AgentEvent,
  type AgentSession,
} from "@aether/core"

function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content
  }

  if (!Array.isArray(content)) {
    return ""
  }

  const textParts = content.flatMap((item) => {
    if (typeof item !== "object" || item === null) {
      return []
    }

    const itemType = "type" in item ? item.type : undefined
    if (itemType !== "text") {
      return []
    }

    const text = "text" in item ? item.text : undefined
    return typeof text === "string" ? [text] : []
  })

  return textParts.join("\n").trim()
}

function getLastAssistantMessage(messages: unknown[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]

    if (typeof message !== "object" || message === null) {
      continue
    }

    const role = "role" in message ? message.role : undefined
    if (role !== "assistant") {
      continue
    }

    const content = "content" in message ? message.content : undefined
    return extractTextContent(content)
  }

  return ""
}

function truncatePreview(text: string): string | undefined {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (normalized.length === 0) {
    return undefined
  }
  return normalized.length <= 700
    ? normalized
    : `${normalized.slice(0, 697)}...`
}

function extractToolResultPreview(result: unknown): string | undefined {
  if (typeof result === "string") {
    return truncatePreview(result)
  }

  if (typeof result !== "object" || result === null || !("content" in result)) {
    return undefined
  }

  const content = result.content
  if (!Array.isArray(content)) {
    return undefined
  }

  const preview = content
    .flatMap((item) => {
      if (typeof item !== "object" || item === null) {
        return []
      }
      const type = "type" in item ? item.type : undefined
      const text = "text" in item ? item.text : undefined
      return type === "text" && typeof text === "string" ? [text] : []
    })
    .join(" ")

  return truncatePreview(preview)
}

function stringifyArgsPreview(args: unknown): string {
  return truncatePreview(JSON.stringify(args ?? {}, null, 2)) ?? ""
}

export interface RunStageOptions {
  session: AgentSession
  prompt: string
  allowedTools?: string[]
  workflowName: string
  runId: string
  stageId: string
  stageIndex: number
  cwd: string
  stageDir: string
  sharedDir?: string
  onEvent?: (event: unknown) => void
}

export interface RunStageResult {
  ok: boolean
  output: string
  error?: string
}

export async function runStage(options: RunStageOptions): Promise<RunStageResult> {
  const eventBus = createEventBus(options.runId, options.onEvent)
  const toolRegistry = createToolRegistry(
    options.session.getAllTools(),
    options.session.getActiveToolNames()
  )
  const toolNames = toolRegistry.resolveAllowedTools(options.allowedTools)
  const activeToolNames =
    toolNames.length > 0 ? toolNames : toolRegistry.getActiveToolNames()

  let currentTurnIndex = 0
  let currentToolCallIndex = 0
  let currentTurnOpen = true

  options.session.setToolContext({
    cwd: options.cwd,
    baseDir: options.stageDir,
    sharedDir: options.sharedDir,
  })
  options.session.setActiveToolsByName(activeToolNames)

  const unsubscribe = options.session.subscribe((event: AgentEvent) => {
    if (
      !currentTurnOpen &&
      (event.type === "tool_execution_start" ||
        event.type === "message_update" ||
        event.type === "message_end")
    ) {
      eventBus.emit("stage.turn.started", {
        workflowName: options.workflowName,
        stageIndex: options.stageIndex,
        stageId: options.stageId,
        turnIndex: currentTurnIndex,
      })
      currentTurnOpen = true
      currentToolCallIndex = 0
    }

    if (event.type === "tool_execution_start") {
      currentToolCallIndex += 1
      eventBus.emit("tool.started", {
        workflowName: options.workflowName,
        stageIndex: options.stageIndex,
        stageId: options.stageId,
        turnIndex: currentTurnIndex,
        toolCallIndex: currentToolCallIndex,
        toolName: event.toolName,
        args:
          typeof event.args === "object" && event.args !== null
            ? (event.args as Record<string, unknown>)
            : {},
        argsPreview: stringifyArgsPreview(event.args),
      })
      return
    }

    if (event.type === "tool_execution_end") {
      eventBus.emit("tool.finished", {
        workflowName: options.workflowName,
        stageIndex: options.stageIndex,
        stageId: options.stageId,
        turnIndex: currentTurnIndex,
        toolCallIndex: currentToolCallIndex,
        toolName: event.toolName,
        isError: event.isError,
        resultPreview: extractToolResultPreview(event.result),
      })
      return
    }

    if (event.type === "message_update") {
      if (event.assistantMessageEvent.type === "text_delta") {
        eventBus.emit("assistant.delta", {
          workflowName: options.workflowName,
          stageIndex: options.stageIndex,
          stageId: options.stageId,
          turnIndex: currentTurnIndex,
          delta: event.assistantMessageEvent.delta,
        })
      }
      return
    }

    if (event.type === "message_end") {
      const assistantText = extractTextContent(event.message.content)
      eventBus.emit("assistant.completed", {
        workflowName: options.workflowName,
        stageIndex: options.stageIndex,
        stageId: options.stageId,
        turnIndex: currentTurnIndex,
        text: assistantText,
      })
      eventBus.emit("stage.turn.completed", {
        workflowName: options.workflowName,
        stageIndex: options.stageIndex,
        stageId: options.stageId,
        turnIndex: currentTurnIndex,
        assistantText,
      })
      currentTurnIndex += 1
      currentToolCallIndex = 0
      currentTurnOpen = false
    }
  })

  try {
    eventBus.emit("stage.tools.activated", {
      workflowName: options.workflowName,
      stageIndex: options.stageIndex,
      stageId: options.stageId,
      declaredTools: options.allowedTools ?? [],
      tools: activeToolNames,
    })
    eventBus.emit("stage.turn.started", {
      workflowName: options.workflowName,
      stageIndex: options.stageIndex,
      stageId: options.stageId,
      turnIndex: 0,
    })
    await options.session.prompt(options.prompt)
    return {
      ok: true,
      output: getLastAssistantMessage(options.session.state.messages).trim(),
    }
  } catch (error) {
    return {
      ok: false,
      output: "",
      error: error instanceof Error ? error.message : "Unknown error",
    }
  } finally {
    unsubscribe()
  }
}
