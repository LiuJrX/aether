import path from "node:path"
import type { AgentRuntime } from "@aether/core"
import { createEventBus, createRunId } from "@aether/observer"

import { renderTemplate } from "./template.js"
import { runStage } from "./stage-runner.js"
import type {
  WorkflowDefinition,
  WorkflowRunOptions,
  WorkflowRunResult,
  WorkflowStageResult,
} from "./types.js"

export class WorkflowEngine {
  private readonly cwd?: string
  private readonly systemPrompt?: string
  private readonly runtime: AgentRuntime

  constructor(options: {
    cwd?: string
    systemPrompt?: string
    runtime: AgentRuntime
  }) {
    this.cwd = options.cwd
    this.systemPrompt = options.systemPrompt
    this.runtime = options.runtime
  }

  async run(
    workflow: WorkflowDefinition,
    options?: WorkflowRunOptions
  ): Promise<WorkflowRunResult> {
    const cwd = options?.cwd ?? this.cwd ?? process.cwd()
    const runId = options?.runId ?? createRunId()
    const eventBus = createEventBus(runId, options?.onEvent)
    const session = await this.runtime.createSession({
      cwd,
      systemPrompt: this.systemPrompt,
    })

    const remoteTools = session
      .getAllTools()
      .map((tool) => tool.name)
      .filter((toolName) => toolName.startsWith("mcp."))

    eventBus.emit("session.created", {
      workflowName: options?.workflowName ?? workflow.name,
      cwd,
      remoteToolCount: remoteTools.length,
      remoteTools,
    })

    eventBus.emit("workflow.started", {
      workflowName: workflow.name,
      stageCount: workflow.stages.length,
    })

    const stages: WorkflowStageResult[] = []
    let previous = ""

    try {
      for (const [stageIndex, stage] of workflow.stages.entries()) {
        eventBus.emit("stage.started", {
          workflowName: options?.workflowName ?? workflow.name,
          stageIndex,
          stageId: stage.id,
          tools: stage.tools ?? [],
        })

        const stageDir = options?.runDir
          ? path.join(options.runDir, "workspace", "stages", String(stageIndex))
          : ""

        const context = {
          ...(options?.variables ?? {}),
          previous,
          workflowName: options?.workflowName ?? workflow.name,
          runId,
          runDir: options?.runDir ?? "",
          sharedDir: options?.sharedDir ?? "",
          stageIndex,
          stageDir,
        }

        let renderedPrompt: string

        try {
          renderedPrompt = renderTemplate(stage.prompt, context)
        } catch (error) {
          stages.push({
            id: stage.id,
            ok: false,
            output: "",
            error:
              error instanceof Error
                ? `Failed to render stage "${stage.id}": ${error.message}`
                : `Failed to render stage "${stage.id}"`,
          })
          eventBus.emit("stage.finished", {
            workflowName: options?.workflowName ?? workflow.name,
            stageIndex,
            stageId: stage.id,
            ok: false,
            outputPreview: "",
            error:
              error instanceof Error ? error.message : "Unknown render error",
          })
          continue
        }

        const result = await runStage({
          session,
          prompt: renderedPrompt,
          allowedTools: stage.tools,
          stageId: stage.id,
          stageIndex,
          stageDir,
          cwd,
          workflowName: options?.workflowName ?? workflow.name,
          runId,
          sharedDir: options?.sharedDir,
          onEvent: options?.onEvent as ((event: unknown) => void) | undefined,
        })

        stages.push({
          id: stage.id,
          ok: result.ok,
          output: result.output,
          error: result.error,
        })

        if (result.ok) {
          previous = result.output
        }

        eventBus.emit("stage.finished", {
          workflowName: options?.workflowName ?? workflow.name,
          stageIndex,
          stageId: stage.id,
          ok: result.ok,
          outputPreview: result.output.slice(0, 160),
          error: result.error,
        })
      }
    } finally {
      session.dispose()
    }

    eventBus.emit("workflow.finished", {
      workflowName: workflow.name,
      ok: stages.every((stage) => stage.ok),
    })

    return {
      name: workflow.name,
      ok: stages.every((stage) => stage.ok),
      stages,
    }
  }
}
