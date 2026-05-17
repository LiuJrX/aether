import fs from "node:fs/promises"
import path from "node:path"
import { createEventBus, type AetherEventBus } from "@aether/observer"
import type { ToolDefinition } from "@earendil-works/pi-coding-agent"

import {
  AuthStorage,
  createAgentSession,
  createWriteTool,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent"

import { loadRemoteMcpTools } from "../../../extensions/remote-mcp/index.js"
import { getAetherModelConfig, loadProjectEnv } from "./env.js"
import type { PiSession, PiSessionOptions } from "./types.js"

const AETHER_PROVIDER_NAME = "aether-openai-compatible"
const TOOL_RESULT_PREVIEW_LIMIT = 700

function truncatePreview(text: string): string | undefined {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (normalized.length === 0) {
    return undefined
  }

  if (normalized.length <= TOOL_RESULT_PREVIEW_LIMIT) {
    return normalized
  }

  return `${normalized.slice(0, TOOL_RESULT_PREVIEW_LIMIT - 3)}...`
}

function extractToolResultPreview(result: unknown): string | undefined {
  if (typeof result === "string") {
    return truncatePreview(result)
  }

  if (typeof result !== "object" || result === null) {
    return undefined
  }

  const content = "content" in result ? result.content : undefined
  if (!Array.isArray(content)) {
    return undefined
  }

  const preview = content
    .flatMap((item) => {
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
    .join(" ")

  return truncatePreview(preview)
}

function extractAssistantText(message: unknown): string {
  if (typeof message !== "object" || message === null || !("content" in message)) {
    return ""
  }

  const content = message.content
  if (!Array.isArray(content)) {
    return ""
  }

  return content
    .flatMap((item) => {
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
    .join("")
    .trim()
}

function stringifyArgsPreview(args: unknown): string {
  return truncatePreview(JSON.stringify(args ?? {}, null, 2)) ?? ""
}

async function ensureAetherModelsFile(cwd: string): Promise<string | undefined> {
  await loadProjectEnv(cwd)

  const config = getAetherModelConfig()
  if (!config) {
    return undefined
  }

  const modelsDir = path.resolve(cwd, ".aether/pi")
  const modelsPath = path.join(modelsDir, "models.json")

  const modelsConfig = {
    providers: {
      [AETHER_PROVIDER_NAME]: {
        baseUrl: config.baseUrl,
        api: "openai-completions",
        apiKey: "AETHER_LLM_API_KEY",
        models: [
          {
            id: config.model,
            name: config.model,
            reasoning: false,
            input: ["text"],
            contextWindow: 128000,
            maxTokens: 16384,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
            },
            compat: {
              supportsDeveloperRole: false,
              supportsReasoningEffort: false,
            },
          },
        ],
      },
    },
  }

  await fs.mkdir(modelsDir, { recursive: true })
  await fs.writeFile(modelsPath, JSON.stringify(modelsConfig, null, 2))

  return modelsPath
}

export async function createSession(
  options: PiSessionOptions
): Promise<PiSession> {
  const cwd = options.cwd ?? process.cwd()
  const fallbackDir = options.sharedDir ?? options.runDir ?? cwd
  const modelsPath = await ensureAetherModelsFile(cwd)
  const authStorage = AuthStorage.create()
  const modelRegistry = modelsPath
    ? ModelRegistry.create(authStorage, modelsPath)
    : ModelRegistry.create(authStorage)
  const aetherModelConfig = getAetherModelConfig()
  const configuredModel =
    aetherModelConfig !== undefined
      ? modelRegistry.find(AETHER_PROVIDER_NAME, aetherModelConfig.model)
      : undefined
  const timeoutSeconds =
    options.timeoutSeconds ?? aetherModelConfig?.timeoutSeconds
  const settingsManager = SettingsManager.inMemory(
    timeoutSeconds !== undefined
      ? {
          retry: {
            provider: {
              timeoutMs: timeoutSeconds * 1000,
            },
          },
        }
      : undefined
  )

  const resourceLoader = options.systemPrompt
    ? new DefaultResourceLoader({
        cwd,
        agentDir: getAgentDir(),
        systemPromptOverride: () => options.systemPrompt ?? "",
        appendSystemPromptOverride: () => [],
      })
    : undefined

  await resourceLoader?.reload()
  const remoteMcp = await loadRemoteMcpTools()
  const staticWriteTool = createWriteTool(fallbackDir)

  let piSession: PiSession
  const writeTool: ToolDefinition = {
    name: "write",
    label: staticWriteTool.label,
    description: staticWriteTool.description,
    parameters: staticWriteTool.parameters,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const targetDir = piSession.currentStageDir ?? options.sharedDir ?? options.runDir ?? cwd
      const tool = createWriteTool(targetDir)
      void ctx
      return tool.execute(
        toolCallId,
        params as { path: string; content: string },
        signal,
        onUpdate
      )
    },
  }

  const { session } = await createAgentSession({
    sessionManager: SessionManager.inMemory(),
    authStorage,
    modelRegistry,
    model: configuredModel,
    resourceLoader,
    settingsManager,
    customTools: [
      writeTool as unknown as ToolDefinition,
      ...(remoteMcp.customTools as unknown as ToolDefinition[]),
    ],
    cwd,
  })

  piSession = {
    session,
    defaultToolNames: session.getActiveToolNames(),
    workflowName: options.workflowName,
    currentStageId: undefined,
    currentStageIndex: undefined,
    currentStageDir: undefined,
    currentTurnIndex: 0,
    currentToolCallIndex: 0,
    currentTurnOpen: false,
  }

  const eventBus: AetherEventBus = createEventBus(options.runId, options.onEvent)

  eventBus.emit("session.created", {
    workflowName: options.workflowName,
    cwd,
    remoteToolCount: remoteMcp.tools.length,
    remoteTools: remoteMcp.tools.map((tool) => tool.namespacedName),
  })

  session.subscribe((event: unknown) => {
    if (typeof event !== "object" || event === null || !("type" in event)) {
      return
    }

    const typedEvent = event as {
      type: string
      toolName?: unknown
      args?: unknown
      isError?: unknown
      result?: unknown
      message?: unknown
      assistantMessageEvent?: unknown
    }

    const workflowName = piSession.workflowName
    const stageId = piSession.currentStageId
    const stageIndex = piSession.currentStageIndex

    if (stageId === undefined || stageIndex === undefined) {
      return
    }

    if (!piSession.currentTurnOpen) {
      eventBus.emit("stage.turn.started", {
        workflowName,
        stageIndex,
        stageId,
        turnIndex: piSession.currentTurnIndex,
      })
      piSession.currentTurnOpen = true
      piSession.currentToolCallIndex = 0
    }

    if (typedEvent.type === "tool_execution_start") {
      piSession.currentToolCallIndex += 1
      eventBus.emit("tool.started", {
        workflowName,
        stageIndex,
        stageId,
        turnIndex: piSession.currentTurnIndex,
        toolCallIndex: piSession.currentToolCallIndex,
        toolName:
          typeof typedEvent.toolName === "string"
            ? typedEvent.toolName
            : "unknown",
        args:
          typeof typedEvent.args === "object" && typedEvent.args !== null
            ? (typedEvent.args as Record<string, unknown>)
            : {},
        argsPreview: stringifyArgsPreview(typedEvent.args),
      })
    }

    if (typedEvent.type === "tool_execution_end") {
      eventBus.emit("tool.finished", {
        workflowName,
        stageIndex,
        stageId,
        turnIndex: piSession.currentTurnIndex,
        toolCallIndex: piSession.currentToolCallIndex,
        toolName:
          typeof typedEvent.toolName === "string"
            ? typedEvent.toolName
            : "unknown",
        isError: typedEvent.isError === true,
        resultPreview: extractToolResultPreview(typedEvent.result),
      })
    }

    if (
      typedEvent.type === "message_update" &&
      typeof typedEvent.assistantMessageEvent === "object" &&
      typedEvent.assistantMessageEvent !== null
    ) {
      const assistantMessageEvent = typedEvent.assistantMessageEvent as {
        type?: unknown
        delta?: unknown
      }

      if (
        assistantMessageEvent.type === "text_delta" &&
        typeof assistantMessageEvent.delta === "string"
      ) {
        eventBus.emit("assistant.delta", {
          workflowName,
          stageIndex,
          stageId,
          turnIndex: piSession.currentTurnIndex,
          delta: assistantMessageEvent.delta,
        })
      }
    }

    if (typedEvent.type === "message_end") {
      const message =
        typeof typedEvent.message === "object" && typedEvent.message !== null
          ? (typedEvent.message as { role?: unknown })
          : undefined

      if (message?.role === "assistant") {
        const assistantText = extractAssistantText(typedEvent.message)

        eventBus.emit("assistant.completed", {
          workflowName,
          stageIndex,
          stageId,
          turnIndex: piSession.currentTurnIndex,
          text: assistantText,
        })
        eventBus.emit("stage.turn.completed", {
          workflowName,
          stageIndex,
          stageId,
          turnIndex: piSession.currentTurnIndex,
          assistantText,
        })
        piSession.currentTurnIndex += 1
        piSession.currentToolCallIndex = 0
        piSession.currentTurnOpen = false
      }
    }
  })

  const dispose = session.dispose.bind(session)
  session.dispose = () => {
    void remoteMcp.dispose()
    dispose()
  }

  return piSession
}
