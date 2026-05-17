import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  createWorkflowRun,
  createWorkflowRunByName,
  resolveWorkflowFilePath,
  type WorkflowRunHandle,
} from "../../packages/sdk/src/run-workflow.js"
import type { AetherRunEvent } from "../../packages/observer/src/index.js"
import { WorkflowEngine } from "../../packages/workflow/src/engine.js"
import type { WorkflowDefinition } from "../../packages/workflow/src/types.js"

test("createWorkflowRun emits workflow and stage lifecycle events in order", async () => {
  const workflow: WorkflowDefinition = {
    name: "demo",
    stages: [
      { id: "gather", prompt: "hello", tools: ["write"] },
      { id: "summarize", prompt: "world", tools: ["write"] },
    ],
  }

  const events: AetherRunEvent[] = []
  const originalRun = WorkflowEngine.prototype.run

  WorkflowEngine.prototype.run = async function mockedRun(_workflow, options) {
    options?.onEvent?.({
      type: "workflow.started",
      runId: options.runId ?? "run_test",
      timestamp: "2026-05-17T00:00:00.000Z",
      workflowName: "demo",
      stageCount: 2,
    })
    options?.onEvent?.({
      type: "stage.started",
      runId: options.runId ?? "run_test",
      timestamp: "2026-05-17T00:00:01.000Z",
      workflowName: "demo",
      stageIndex: 0,
      stageId: "gather",
      tools: ["write"],
    })
    options?.onEvent?.({
      type: "stage.finished",
      runId: options.runId ?? "run_test",
      timestamp: "2026-05-17T00:00:02.000Z",
      workflowName: "demo",
      stageIndex: 0,
      stageId: "gather",
      ok: true,
      outputPreview: "done",
    })
    options?.onEvent?.({
      type: "workflow.finished",
      runId: options.runId ?? "run_test",
      timestamp: "2026-05-17T00:00:03.000Z",
      workflowName: "demo",
      ok: true,
    })

    return {
      name: "demo",
      ok: true,
      stages: [
        {
          id: "gather",
          ok: true,
          output: "done",
        },
      ],
    }
  }

  const workflowRun: WorkflowRunHandle = createWorkflowRun(workflow, {
    cwd: process.cwd(),
    onEvent: (event: AetherRunEvent) => {
      events.push(event)
    },
  })

  try {
    const result = await workflowRun.result

    assert.equal(result.ok, true)
    assert.deepEqual(
      events.map((event) => event.type),
      [
        "workflow.started",
        "stage.started",
        "stage.finished",
        "workflow.finished",
      ]
    )
    assert.ok(events.every((event) => event.runId === workflowRun.runId))
  } finally {
    WorkflowEngine.prototype.run = originalRun
  }
})

test("createWorkflowRunByName resolves the standard workflow path and injects run context", async () => {
  const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), "aether-sdk-"))
  const workflowDir = path.join(tempCwd, ".aether/workflows/research")
  await fs.mkdir(workflowDir, { recursive: true })
  await fs.writeFile(
    path.join(workflowDir, "research.workflow.yaml"),
    [
      "name: research",
      "stages:",
      "  - id: gather",
      "    prompt: |",
      "      workflow={{workflowName}}",
      "      run={{runId}}",
      "      dir={{runDir}}",
    ].join("\n")
  )

  const originalRun = WorkflowEngine.prototype.run
  const receivedOptions: Array<{
    runId?: string
    runDir?: string
    sharedDir?: string
    workflowName?: string
    variables?: Record<string, unknown>
  }> = []

  WorkflowEngine.prototype.run = async function mockedRun(_workflow, options) {
    receivedOptions.push({
      runId: options?.runId,
      runDir: options?.runDir,
      sharedDir: options?.sharedDir,
      workflowName: options?.workflowName,
      variables: options?.variables,
    })

    return {
      name: "research",
      ok: true,
      stages: [
        {
          id: "gather",
          ok: true,
          output: "done",
        },
      ],
    }
  }

  try {
    const workflowRun = createWorkflowRunByName("research", { cwd: tempCwd })
    const result = await workflowRun.result

    assert.equal(result.ok, true)
    assert.equal(
      resolveWorkflowFilePath("research", tempCwd),
      path.join(workflowDir, "research.workflow.yaml")
    )
    assert.match(workflowRun.runId, /^\d{18}$/)
    assert.equal(
      workflowRun.runDir,
      path.join(tempCwd, ".aether/runs", `research_${workflowRun.runId}`)
    )
    assert.deepEqual(receivedOptions, [
      {
        runId: workflowRun.runId,
        runDir: workflowRun.runDir,
        sharedDir: path.join(workflowRun.runDir, "workspace/shared"),
        workflowName: "research",
        variables: undefined,
      },
    ])
  } finally {
    WorkflowEngine.prototype.run = originalRun
  }
})
