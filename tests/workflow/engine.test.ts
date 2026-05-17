import test from "node:test"
import assert from "node:assert/strict"

import type { AetherRunEvent } from "../../packages/observer/src/index.js"
import { WorkflowEngine } from "../../packages/workflow/src/engine.js"
import type { WorkflowDefinition } from "../../packages/workflow/src/types.js"

test("WorkflowEngine runs stages sequentially and passes previous output", async () => {
  const prompts: string[] = []

  const workflow: WorkflowDefinition = {
    name: "demo",
    stages: [
      { id: "first", prompt: "topic={{topic}} previous={{previous}}" },
      { id: "second", prompt: "follow={{previous}}" },
    ],
  }

  const engine = new WorkflowEngine({
    createSession: async () => ({
      session: {
        prompt: async () => undefined,
        getActiveToolNames: () => ["read", "bash", "edit", "write"],
        getAllTools: () => [{ name: "read" }, { name: "write" }],
        setActiveToolsByName: () => undefined,
        state: { messages: [] },
        subscribe: () => () => undefined,
        dispose: () => undefined,
      },
      defaultToolNames: ["read", "bash", "edit", "write"],
      workflowName: "demo",
      currentTurnIndex: 0,
      currentToolCallIndex: 0,
      currentTurnOpen: false,
    }),
    runTask: async (_session, options) => {
      prompts.push(options.prompt)
      return {
        ok: true,
        output: options.prompt.includes("follow=") ? "second output" : "first output",
      }
    },
  })

  const result = await engine.run(workflow, {
    variables: { topic: "Aether" },
  })

  assert.deepEqual(prompts, ["topic=Aether previous=", "follow=first output"])
  assert.equal(result.ok, true)
  assert.deepEqual(
    result.stages.map((stage) => stage.output),
    ["first output", "second output"]
  )
})

test("WorkflowEngine keeps previous successful output when a stage fails", async () => {
  const prompts: string[] = []

  const workflow: WorkflowDefinition = {
    name: "demo",
    stages: [
      { id: "first", prompt: "one" },
      { id: "second", prompt: "two {{previous}}" },
      { id: "third", prompt: "three {{previous}}" },
    ],
  }

  const engine = new WorkflowEngine({
    createSession: async () => ({
      session: {
        prompt: async () => undefined,
        getActiveToolNames: () => ["write"],
        getAllTools: () => [{ name: "write" }],
        setActiveToolsByName: () => undefined,
        state: { messages: [] },
        subscribe: () => () => undefined,
        dispose: () => undefined,
      },
      defaultToolNames: ["write"],
      workflowName: "demo",
      currentTurnIndex: 0,
      currentToolCallIndex: 0,
      currentTurnOpen: false,
    }),
    runTask: async (_session, options) => {
      prompts.push(options.prompt)

      if (options.prompt.startsWith("two")) {
        return { ok: false, output: "", error: "boom" }
      }

      if (options.prompt.startsWith("three")) {
        return { ok: true, output: "third ok" }
      }

      return { ok: true, output: "first ok" }
    },
  })

  const result = await engine.run(workflow)

  assert.deepEqual(prompts, ["one", "two first ok", "three first ok"])
  assert.equal(result.ok, false)
  assert.deepEqual(
    result.stages.map((stage) => ({
      id: stage.id,
      ok: stage.ok,
      error: stage.error,
    })),
    [
      { id: "first", ok: true, error: undefined },
      { id: "second", ok: false, error: "boom" },
      { id: "third", ok: true, error: undefined },
    ]
  )
})

test("WorkflowEngine records template rendering failures and continues", async () => {
  const workflow: WorkflowDefinition = {
    name: "demo",
    stages: [
      { id: "broken", prompt: "hello {{missing}}" },
      { id: "final", prompt: "done {{previous}}" },
    ],
  }

  const engine = new WorkflowEngine({
    createSession: async () => ({
      session: {
        prompt: async () => undefined,
        getActiveToolNames: () => ["write"],
        getAllTools: () => [{ name: "write" }],
        setActiveToolsByName: () => undefined,
        state: { messages: [] },
        subscribe: () => () => undefined,
        dispose: () => undefined,
      },
      defaultToolNames: ["write"],
      workflowName: "demo",
      currentTurnIndex: 0,
      currentToolCallIndex: 0,
      currentTurnOpen: false,
    }),
    runTask: async () => ({
      ok: true,
      output: "done",
    }),
  })

  const result = await engine.run(workflow)

  assert.equal(result.ok, false)
  assert.equal(result.stages[0]?.ok, false)
  assert.match(
    result.stages[0]?.error ?? "",
    /Failed to render stage "broken": Variable "\{\{missing\}\}" is not defined\./
  )
  assert.equal(result.stages[1]?.ok, true)
})

test("WorkflowEngine passes stage ids into runTask", async () => {
  const stageIds: string[] = []

  const workflow: WorkflowDefinition = {
    name: "demo",
    stages: [
      { id: "gather", prompt: "one" },
      { id: "summarize", prompt: "two" },
    ],
  }

  const engine = new WorkflowEngine({
    createSession: async () => ({
      session: {
        prompt: async () => undefined,
        getActiveToolNames: () => ["write"],
        getAllTools: () => [{ name: "write" }],
        setActiveToolsByName: () => undefined,
        state: { messages: [] },
        subscribe: () => () => undefined,
        dispose: () => undefined,
      },
      defaultToolNames: ["write"],
      currentStageId: undefined,
      workflowName: "demo",
      currentTurnIndex: 0,
      currentToolCallIndex: 0,
      currentTurnOpen: false,
    }),
    runTask: async (_session, options) => {
      stageIds.push(options.stageId ?? "")
      return {
        ok: true,
        output: options.prompt,
      }
    },
  })

  await engine.run(workflow)

  assert.deepEqual(stageIds, ["gather", "summarize"])
})

test("WorkflowEngine injects workflow run context into template variables", async () => {
  const prompts: string[] = []

  const workflow: WorkflowDefinition = {
    name: "demo",
    stages: [
      { id: "gather", prompt: "workflow={{workflowName}} run={{runId}} dir={{runDir}}" },
    ],
  }

  const engine = new WorkflowEngine({
    createSession: async () => ({
      session: {
        prompt: async () => undefined,
        getActiveToolNames: () => ["write"],
        getAllTools: () => [{ name: "write" }],
        setActiveToolsByName: () => undefined,
        state: { messages: [] },
        subscribe: () => () => undefined,
        dispose: () => undefined,
      },
      defaultToolNames: ["write"],
      currentStageId: undefined,
      workflowName: "demo",
      currentTurnIndex: 0,
      currentToolCallIndex: 0,
      currentTurnOpen: false,
    }),
    runTask: async (_session, options) => {
      prompts.push(options.prompt)
      return {
        ok: true,
        output: "done",
      }
    },
  })

  await engine.run(workflow, {
    workflowName: "research",
    runId: "202605171430009999",
    runDir: "/tmp/aether/.aether/runs/research_202605171430009999",
  })

  assert.deepEqual(prompts, [
    "workflow=research run=202605171430009999 dir=/tmp/aether/.aether/runs/research_202605171430009999",
  ])
})

test("WorkflowEngine emits structured lifecycle events", async () => {
  const events: AetherRunEvent[] = []

  const workflow: WorkflowDefinition = {
    name: "demo",
    stages: [
      { id: "gather", prompt: "one", tools: ["write"] },
    ],
  }

  const engine = new WorkflowEngine({
    createSession: async () => ({
      session: {
        prompt: async () => undefined,
        getActiveToolNames: () => ["write"],
        getAllTools: () => [{ name: "write" }],
        setActiveToolsByName: () => undefined,
        state: { messages: [] },
        subscribe: () => () => undefined,
        dispose: () => undefined,
      },
      defaultToolNames: ["write"],
      currentStageId: undefined,
      workflowName: "demo",
      currentTurnIndex: 0,
      currentToolCallIndex: 0,
      currentTurnOpen: false,
    }),
    runTask: async (_session, options) => {
      options.onEvent?.({
        type: "stage.tools.activated",
        runId: options.runId,
        timestamp: "2026-05-17T00:00:00.000Z",
        workflowName: options.workflowName,
        stageIndex: options.stageIndex,
        stageId: options.stageId ?? "unknown",
        declaredTools: options.allowedTools ?? [],
        tools: ["write"],
      })

      return {
        ok: true,
        output: "done",
      }
    },
  })

  await engine.run(workflow, {
    runId: "run_test",
    onEvent: (event: AetherRunEvent) => {
      events.push(event)
    },
  })

  assert.deepEqual(
    events.map((event) => event.type),
    [
      "workflow.started",
      "stage.started",
      "stage.tools.activated",
      "stage.finished",
      "workflow.finished",
    ]
  )
  assert.ok(events.every((event) => event.runId === "run_test"))
})
