import { createEventBus } from "@aether/observer"
import type { PiSession, PiTaskOptions, PiTaskResult } from "./types.js"

function expandAllowedTools(
  allowedTools: string[] | undefined,
  allToolNames: string[],
  defaultToolNames: string[]
): string[] {
  if (!allowedTools || allowedTools.length === 0) {
    return allToolNames.length > 0 ? allToolNames : defaultToolNames
  }

  const resolved = new Set<string>()

  for (const toolName of allowedTools) {
    if (toolName.startsWith("mcp:")) {
      const provider = toolName.slice("mcp:".length).trim()
      if (provider.length === 0) {
        continue
      }

      const prefix = `mcp.${provider}.`
      for (const candidate of allToolNames) {
        if (candidate.startsWith(prefix)) {
          resolved.add(candidate)
        }
      }
      continue
    }

    const wildcardMatch = /^mcp\.([^.]+)\.\*$/.exec(toolName)
    if (wildcardMatch) {
      const provider = wildcardMatch[1]
      const prefix = `mcp.${provider}.`
      for (const candidate of allToolNames) {
        if (candidate.startsWith(prefix)) {
          resolved.add(candidate)
        }
      }
      continue
    }

    resolved.add(toolName)
  }

  return resolved.size > 0 ? [...resolved] : defaultToolNames
}

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

export async function runTask(
  piSession: PiSession,
  options: PiTaskOptions
): Promise<PiTaskResult> {
  const { session, defaultToolNames } = piSession
  const eventBus = createEventBus(options.runId, options.onEvent)

  try {
    piSession.currentStageId = options.stageId
    piSession.currentStageIndex = options.stageIndex
    piSession.currentStageDir = options.stageDir
    piSession.currentTurnIndex = 0
    piSession.currentToolCallIndex = 0
    piSession.currentTurnOpen = true

    const allToolNames = session.getAllTools().map((tool) => tool.name)
    const toolNames = expandAllowedTools(
      options.allowedTools,
      allToolNames,
      defaultToolNames
    )

    session.setActiveToolsByName(
      toolNames.length > 0 ? toolNames : defaultToolNames
    )

    eventBus.emit("stage.tools.activated", {
      workflowName: options.workflowName,
      stageIndex: options.stageIndex,
      stageId: options.stageId ?? "unknown",
      declaredTools: options.allowedTools ?? [],
      tools: toolNames.length > 0 ? toolNames : defaultToolNames,
    })
    eventBus.emit("stage.turn.started", {
      workflowName: options.workflowName,
      stageIndex: options.stageIndex,
      stageId: options.stageId ?? "unknown",
      turnIndex: 0,
    })

    await session.prompt(options.prompt)

    return {
      ok: true,
      output: getLastAssistantMessage(session.state.messages).trim(),
    }
  } catch (error) {
    return {
      ok: false,
      output: "",
      error: error instanceof Error ? error.message : "Unknown error",
    }
  } finally {
    piSession.currentStageId = undefined
    piSession.currentStageIndex = undefined
    piSession.currentStageDir = undefined
    piSession.currentTurnIndex = 0
    piSession.currentToolCallIndex = 0
    piSession.currentTurnOpen = false
  }
}
