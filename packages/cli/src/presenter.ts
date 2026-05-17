import type { AetherRunEvent } from "../../observer/src/index.js"
import type { WorkflowRunResult } from "../../workflow/src/types.js"

export type LogLevel = "quiet" | "normal" | "verbose"
export type OutputFormat = "summary" | "json"

const ANSI = {
  reset: "\u001B[0m",
  dim: "\u001B[2m",
  cyan: "\u001B[36m",
  blue: "\u001B[34m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
  red: "\u001B[31m",
  magenta: "\u001B[35m",
} as const

const TYPE_EMOJI: Record<AetherRunEvent["type"], string> = {
  "session.created": "🔌",
  "workflow.started": "🧭",
  "workflow.finished": "🧭",
  "stage.started": "📍",
  "stage.tools.activated": "🧰",
  "stage.turn.started": "🔄",
  "stage.turn.completed": "🔄",
  "stage.finished": "📍",
  "tool.started": "🛠️",
  "tool.finished": "🛠️",
  "assistant.delta": "🤖",
  "assistant.completed": "🤖",
}

function color(text: string, value: string): string {
  return `${value}${text}${ANSI.reset}`
}

function eventColor(event: AetherRunEvent): string {
  switch (event.type) {
    case "workflow.started":
    case "workflow.finished":
      return ANSI.blue
    case "stage.started":
    case "stage.tools.activated":
    case "stage.turn.started":
    case "stage.turn.completed":
    case "stage.finished":
      return ANSI.cyan
    case "tool.started":
    case "tool.finished":
      return ANSI.magenta
    case "session.created":
      return ANSI.yellow
    case "assistant.delta":
    case "assistant.completed":
      return ANSI.green
    default:
      return ANSI.reset
  }
}

function eventLabel(event: AetherRunEvent): string {
  switch (event.type) {
    case "session.created":
      return "session"
    case "workflow.started":
    case "workflow.finished":
      return "workflow"
    case "stage.started":
    case "stage.tools.activated":
    case "stage.turn.started":
    case "stage.turn.completed":
    case "stage.finished":
      return "stage"
    case "tool.started":
    case "tool.finished":
      return "tool"
    case "assistant.delta":
    case "assistant.completed":
      return event.stageId ? `assistant:${event.stageId}` : "assistant"
    default:
      return "event"
  }
}

function eventMessage(event: AetherRunEvent): string {
  switch (event.type) {
    case "session.created":
      return "Pi session created"
    case "workflow.started":
      return `Workflow started: ${event.workflowName}`
    case "workflow.finished":
      return `Workflow finished: ${event.workflowName}`
    case "stage.started":
      return `Stage started: ${event.stageId}`
    case "stage.tools.activated":
      return "Activated tools for stage"
    case "stage.turn.started":
      return `Turn started: ${event.turnIndex}`
    case "stage.turn.completed":
      return `Turn completed: ${event.turnIndex}`
    case "stage.finished":
      return `Stage finished: ${event.stageId}`
    case "tool.started":
      return `Tool start: ${event.toolName}`
    case "tool.finished":
      return `Tool end: ${event.toolName}`
    case "assistant.delta":
      return event.delta
    case "assistant.completed":
      return "Assistant message completed"
    default:
      return "event"
  }
}

function eventDetails(event: AetherRunEvent): Record<string, unknown> | undefined {
  switch (event.type) {
    case "session.created":
      return {
        cwd: event.cwd,
        remoteToolCount: event.remoteToolCount,
        remoteTools: event.remoteTools,
      }
    case "workflow.started":
      return {
        workflowName: event.workflowName,
        stageCount: event.stageCount,
        runId: event.runId,
      }
    case "workflow.finished":
      return {
        workflowName: event.workflowName,
        ok: event.ok,
        runId: event.runId,
      }
    case "stage.started":
      return {
        stageId: event.stageId,
        tools: event.tools,
      }
    case "stage.tools.activated":
      return {
        workflowName: event.workflowName,
        stageIndex: event.stageIndex,
        stageId: event.stageId,
        declaredTools: event.declaredTools,
        tools: event.tools,
      }
    case "stage.turn.started":
      return {
        workflowName: event.workflowName,
        stageIndex: event.stageIndex,
        stageId: event.stageId,
        turnIndex: event.turnIndex,
      }
    case "stage.turn.completed":
      return {
        workflowName: event.workflowName,
        stageIndex: event.stageIndex,
        stageId: event.stageId,
        turnIndex: event.turnIndex,
      }
    case "stage.finished":
      return {
        workflowName: event.workflowName,
        stageIndex: event.stageIndex,
        stageId: event.stageId,
        ok: event.ok,
        outputPreview: event.outputPreview,
        error: event.error,
      }
    case "tool.started":
      return {
        workflowName: event.workflowName,
        stageIndex: event.stageIndex,
        stageId: event.stageId,
        turnIndex: event.turnIndex,
        toolCallIndex: event.toolCallIndex,
        toolName: event.toolName,
        args: event.args,
      }
    case "tool.finished":
      return {
        workflowName: event.workflowName,
        stageIndex: event.stageIndex,
        stageId: event.stageId,
        turnIndex: event.turnIndex,
        toolCallIndex: event.toolCallIndex,
        toolName: event.toolName,
        isError: event.isError,
        resultPreview: event.resultPreview,
      }
    case "assistant.delta":
    case "assistant.completed":
      return undefined
    default:
      return undefined
  }
}

export function printStageSummary(
  result: WorkflowRunResult,
  output: Pick<typeof console, "log"> = console
) {
  const title = result.ok
    ? color("Workflow succeeded", ANSI.green)
    : color("Workflow finished with failures", ANSI.red)

  output.log(`\n${title}: ${result.name}`)

  for (const stage of result.stages) {
    const status = stage.ok
      ? color("OK", ANSI.green)
      : color("FAIL", ANSI.red)

    output.log(`- ${stage.id}: ${status}`)

    if (stage.error) {
      output.log(`  error: ${stage.error}`)
      continue
    }

    const preview = stage.output.replace(/\s+/g, " ").trim().slice(0, 180)
    if (preview.length > 0) {
      output.log(`  preview: ${preview}${stage.output.length > 180 ? "..." : ""}`)
    }
  }
}

export function createCliPresenter(
  logLevel: LogLevel,
  io: {
    log: (text: string) => void
    write: (text: string) => void
  } = {
    log: console.log,
    write: (text) => process.stdout.write(text),
  }
): (event: AetherRunEvent) => void {
  let assistantStreaming = false
  let lastAssistantSection: string | undefined

  function shouldLog(event: AetherRunEvent): boolean {
    if (logLevel === "quiet") {
      return false
    }

    if (logLevel === "verbose") {
      return true
    }

    return event.type !== "session.created" &&
      event.type !== "assistant.delta" &&
      event.type !== "assistant.completed" &&
      event.type !== "stage.tools.activated" &&
      event.type !== "stage.turn.started" &&
      event.type !== "stage.turn.completed"
  }

  return (event: AetherRunEvent) => {
    if (!shouldLog(event)) {
      return
    }

    if (event.type === "assistant.delta") {
      const section = eventLabel(event)

      if (!assistantStreaming || lastAssistantSection !== section) {
        if (assistantStreaming) {
          io.write("\n")
        }

        const header = color(`[${section}]`, eventColor(event))
        io.write(`\n${TYPE_EMOJI[event.type]} ${header} `)
        assistantStreaming = true
        lastAssistantSection = section
      }

      io.write(color(event.delta, ANSI.green))
      return
    }

    if (event.type === "assistant.completed") {
      if (assistantStreaming) {
        io.write(`\n${color("────────────────────", ANSI.dim)}\n`)
        assistantStreaming = false
        lastAssistantSection = undefined
      }
      return
    }

    if (assistantStreaming) {
      io.write("\n")
      assistantStreaming = false
      lastAssistantSection = undefined
    }

    const label = eventLabel(event)
    const prefix = color(`[${label}]`, eventColor(event))
    io.log(`\n${TYPE_EMOJI[event.type]} ${prefix} ${eventMessage(event)}`)

    const details = eventDetails(event)
    if (details && Object.keys(details).length > 0) {
      io.log(color(JSON.stringify(details, null, 2), ANSI.dim))
    }

    if (event.type === "tool.finished" && typeof event.resultPreview === "string") {
      io.log(color(`📦 result: ${event.resultPreview}`, ANSI.yellow))
    }
  }
}
