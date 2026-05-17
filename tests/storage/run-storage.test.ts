import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  createFileSystemRunStorage,
  resolveRunDirectories,
} from "../../packages/storage/src/index.js"
import type { AetherRunEvent } from "../../packages/observer/src/index.js"

test("createFileSystemRunStorage creates run directories and persists run summary", async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "aether-storage-"))
  const storage = await createFileSystemRunStorage({
    cwd,
    workflowName: "research",
    runId: "202605171430009999",
  })

  const expected = resolveRunDirectories(cwd, "research", "202605171430009999")

  assert.equal(storage.runDir, expected.runDir)
  assert.equal(storage.aetherDir, expected.aetherDir)
  assert.equal(storage.workspaceDir, expected.workspaceDir)
  assert.equal(storage.sharedDir, expected.sharedDir)

  await storage.recordEvent({
    type: "workflow.started",
    runId: "202605171430009999",
    timestamp: "2026-05-17T14:30:00.000Z",
    workflowName: "research",
    stageCount: 1,
  })
  await storage.recordEvent({
    type: "stage.started",
    runId: "202605171430009999",
    timestamp: "2026-05-17T14:30:01.000Z",
    workflowName: "research",
    stageIndex: 0,
    stageId: "gather",
    tools: ["write"],
  })
  await storage.recordEvent({
    type: "stage.turn.started",
    runId: "202605171430009999",
    timestamp: "2026-05-17T14:30:02.000Z",
    workflowName: "research",
    stageIndex: 0,
    stageId: "gather",
    turnIndex: 0,
  })
  await storage.recordEvent({
    type: "tool.started",
    runId: "202605171430009999",
    timestamp: "2026-05-17T14:30:03.000Z",
    workflowName: "research",
    stageIndex: 0,
    stageId: "gather",
    turnIndex: 0,
    toolCallIndex: 1,
    toolName: "write",
    args: { path: "report.md" },
    argsPreview: "{\"path\":\"report.md\"}",
  })
  await storage.recordEvent({
    type: "tool.finished",
    runId: "202605171430009999",
    timestamp: "2026-05-17T14:30:04.000Z",
    workflowName: "research",
    stageIndex: 0,
    stageId: "gather",
    turnIndex: 0,
    toolCallIndex: 1,
    toolName: "write",
    isError: false,
    resultPreview: "done",
  })
  await storage.recordEvent({
    type: "stage.turn.completed",
    runId: "202605171430009999",
    timestamp: "2026-05-17T14:30:05.000Z",
    workflowName: "research",
    stageIndex: 0,
    stageId: "gather",
    turnIndex: 0,
    assistantText: "completed",
  })
  await storage.recordEvent({
    type: "stage.finished",
    runId: "202605171430009999",
    timestamp: "2026-05-17T14:30:06.000Z",
    workflowName: "research",
    stageIndex: 0,
    stageId: "gather",
    ok: true,
    outputPreview: "completed",
  })
  await storage.recordEvent({
    type: "workflow.finished",
    runId: "202605171430009999",
    timestamp: "2026-05-17T14:30:07.000Z",
    workflowName: "research",
    ok: true,
  })
  await storage.flush()

  const runJson = JSON.parse(
    await fs.readFile(path.join(storage.aetherDir, "run.json"), "utf8")
  ) as {
    workflowName: string
    stageCount: number
    stages: Array<{ stageIndex: number; stageId: string; turnCount: number }>
  }
  const turnsJson = JSON.parse(
    await fs.readFile(path.join(storage.aetherDir, "stages/0/turns.json"), "utf8")
  ) as Array<{
    turnIndex: number
    assistantText: string
    tools: Array<{ toolCallIndex: number; toolName: string; resultPreview: string }>
  }>

  assert.equal(runJson.workflowName, "research")
  assert.equal(runJson.stageCount, 1)
  assert.deepEqual(runJson.stages, [
    {
      stageIndex: 0,
      stageId: "gather",
      turnCount: 1,
      workspaceDir: path.join(storage.workspaceDir, "stages/0"),
      outputPreview: "completed",
      ok: true,
    },
  ])
  assert.deepEqual(turnsJson, [
    {
      turnIndex: 0,
      startedAt: "2026-05-17T14:30:02.000Z",
      finishedAt: "2026-05-17T14:30:05.000Z",
      assistantText: "completed",
      tools: [
        {
          toolCallIndex: 1,
          toolName: "write",
          argsPreview: "{\"path\":\"report.md\"}",
          resultPreview: "done",
          isError: false,
        },
      ],
    },
  ])
})
