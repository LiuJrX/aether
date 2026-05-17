import fs from "node:fs/promises"
import path from "node:path"

import type { AetherRunEvent } from "@aether/observer"

export interface RunDirectories {
  runDir: string
  aetherDir: string
  workspaceDir: string
  sharedDir: string
}

export interface StageDirectories {
  aetherStageDir: string
  workspaceStageDir: string
}

interface RunStageSummary {
  stageIndex: number
  stageId: string
  ok?: boolean
  turnCount: number
  workspaceDir: string
  outputPreview: string
}

interface RunSummary {
  workflowName: string
  runId: string
  startedAt?: string
  finishedAt?: string
  ok?: boolean
  stageCount: number
  stages: RunStageSummary[]
}

interface TurnToolSummary {
  toolCallIndex: number
  toolName: string
  argsPreview: string
  resultPreview: string
  isError: boolean
}

interface StageTurnSummary {
  turnIndex: number
  startedAt: string
  finishedAt?: string
  assistantText: string
  tools: TurnToolSummary[]
}

export interface RunStorageSession extends RunDirectories {
  runId: string
  workflowName: string
  getStageDirectories(stageIndex: number): StageDirectories
  recordEvent(event: AetherRunEvent): Promise<void>
  flush(): Promise<void>
}

export function resolveRunDirectories(
  cwd: string,
  workflowName: string,
  runId: string
): RunDirectories {
  const runDir = path.resolve(cwd, ".aether/runs", `${workflowName}_${runId}`)
  return {
    runDir,
    aetherDir: path.join(runDir, "aether"),
    workspaceDir: path.join(runDir, "workspace"),
    sharedDir: path.join(runDir, "workspace/shared"),
  }
}

export function resolveStageDirectories(
  runDir: string,
  stageIndex: number
): StageDirectories {
  return {
    aetherStageDir: path.join(runDir, "aether/stages", String(stageIndex)),
    workspaceStageDir: path.join(runDir, "workspace/stages", String(stageIndex)),
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(value, null, 2))
}

function truncate(value: unknown, limit: number = 240): string {
  const raw =
    typeof value === "string" ? value : JSON.stringify(value ?? "", null, 2) ?? ""
  const normalized = raw.replace(/\s+/g, " ").trim()
  if (normalized.length <= limit) {
    return normalized
  }

  return `${normalized.slice(0, limit - 3)}...`
}

export async function createFileSystemRunStorage(params: {
  cwd: string
  workflowName: string
  runId: string
}): Promise<RunStorageSession> {
  const directories = resolveRunDirectories(params.cwd, params.workflowName, params.runId)

  await fs.mkdir(directories.aetherDir, { recursive: true })
  await fs.mkdir(directories.sharedDir, { recursive: true })

  const runSummary: RunSummary = {
    workflowName: params.workflowName,
    runId: params.runId,
    stageCount: 0,
    stages: [],
  }

  const turnsByStage = new Map<number, StageTurnSummary[]>()
  let queue = Promise.resolve()

  function getStageDirectories(stageIndex: number): StageDirectories {
    return resolveStageDirectories(directories.runDir, stageIndex)
  }

  async function ensureStage(stageIndex: number, stageId: string): Promise<RunStageSummary> {
    const existing = runSummary.stages.find((stage) => stage.stageIndex === stageIndex)
    if (existing) {
      return existing
    }

    const stageDirectories = getStageDirectories(stageIndex)
    await fs.mkdir(stageDirectories.aetherStageDir, { recursive: true })
    await fs.mkdir(stageDirectories.workspaceStageDir, { recursive: true })

    const stageSummary: RunStageSummary = {
      stageIndex,
      stageId,
      turnCount: 0,
      workspaceDir: stageDirectories.workspaceStageDir,
      outputPreview: "",
    }
    runSummary.stages.push(stageSummary)
    runSummary.stages.sort((left, right) => left.stageIndex - right.stageIndex)
    return stageSummary
  }

  function ensureTurn(stageIndex: number, turnIndex: number, timestamp: string): StageTurnSummary {
    const turns = turnsByStage.get(stageIndex) ?? []
    let turn = turns.find((candidate) => candidate.turnIndex === turnIndex)

    if (!turn) {
      turn = {
        turnIndex,
        startedAt: timestamp,
        assistantText: "",
        tools: [],
      }
      turns.push(turn)
      turns.sort((left, right) => left.turnIndex - right.turnIndex)
      turnsByStage.set(stageIndex, turns)
    }

    return turn
  }

  async function writeRunSummary(): Promise<void> {
    await writeJsonFile(path.join(directories.aetherDir, "run.json"), runSummary)
  }

  async function writeTurns(stageIndex: number): Promise<void> {
    const stageDirectories = getStageDirectories(stageIndex)
    const turns = turnsByStage.get(stageIndex) ?? []
    await writeJsonFile(path.join(stageDirectories.aetherStageDir, "turns.json"), turns)
  }

  async function applyEvent(event: AetherRunEvent): Promise<void> {
    switch (event.type) {
      case "workflow.started":
        runSummary.startedAt = event.timestamp
        runSummary.stageCount = event.stageCount
        break
      case "workflow.finished":
        runSummary.finishedAt = event.timestamp
        runSummary.ok = event.ok
        break
      case "stage.started": {
        await ensureStage(event.stageIndex, event.stageId)
        break
      }
      case "stage.finished": {
        const stage = await ensureStage(event.stageIndex, event.stageId)
        stage.ok = event.ok
        stage.outputPreview = event.outputPreview
        stage.turnCount = turnsByStage.get(event.stageIndex)?.length ?? 0
        break
      }
      case "stage.turn.started": {
        await ensureStage(event.stageIndex, event.stageId)
        ensureTurn(event.stageIndex, event.turnIndex, event.timestamp)
        break
      }
      case "stage.turn.completed": {
        await ensureStage(event.stageIndex, event.stageId)
        const turn = ensureTurn(event.stageIndex, event.turnIndex, event.timestamp)
        turn.finishedAt = event.timestamp
        turn.assistantText = event.assistantText
        break
      }
      case "tool.started": {
        await ensureStage(event.stageIndex, event.stageId)
        const turn = ensureTurn(event.stageIndex, event.turnIndex, event.timestamp)
        const existingTool = turn.tools.find(
          (candidate) => candidate.toolCallIndex === event.toolCallIndex
        )
        if (!existingTool) {
          turn.tools.push({
            toolCallIndex: event.toolCallIndex,
            toolName: event.toolName,
            argsPreview: event.argsPreview,
            resultPreview: "",
            isError: false,
          })
          turn.tools.sort((left, right) => left.toolCallIndex - right.toolCallIndex)
        }
        break
      }
      case "tool.finished": {
        await ensureStage(event.stageIndex, event.stageId)
        const turn = ensureTurn(event.stageIndex, event.turnIndex, event.timestamp)
        const tool =
          turn.tools.find((candidate) => candidate.toolCallIndex === event.toolCallIndex) ??
          (() => {
            const created: TurnToolSummary = {
              toolCallIndex: event.toolCallIndex,
              toolName: event.toolName,
              argsPreview: "",
              resultPreview: "",
              isError: event.isError,
            }
            turn.tools.push(created)
            turn.tools.sort((left, right) => left.toolCallIndex - right.toolCallIndex)
            return created
          })()

        tool.resultPreview = event.resultPreview ?? ""
        tool.isError = event.isError
        break
      }
      default:
        break
    }

    if (
      "stageIndex" in event &&
      typeof event.stageIndex === "number" &&
      event.type !== "assistant.delta" &&
      event.type !== "assistant.completed" &&
      event.type !== "stage.tools.activated"
    ) {
      await writeTurns(event.stageIndex)
    }

    await writeRunSummary()
  }

  return {
    runId: params.runId,
    workflowName: params.workflowName,
    ...directories,
    getStageDirectories,
    async recordEvent(event: AetherRunEvent) {
      queue = queue.then(() => applyEvent(event))
      await queue
    },
    async flush() {
      await queue
    },
  }
}
