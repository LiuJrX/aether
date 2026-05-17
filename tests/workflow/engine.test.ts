import test from "node:test"
import assert from "node:assert/strict"

import type { AgentRuntime, AgentSession } from "../../packages/core/src/agent/index.js"
import type { AetherRunEvent } from "../../packages/observer/src/index.js"
import { WorkflowEngine } from "../../packages/workflow/src/engine.js"
import type { WorkflowDefinition } from "../../packages/workflow/src/types.js"

function createSession(overrides?: Partial<AgentSession>): AgentSession {
  return {
    prompt: overrides?.prompt ?? (async () => undefined),
    getActiveToolNames: overrides?.getActiveToolNames ?? (() => ["write"]),
    getAllTools: overrides?.getAllTools ?? (() => [{ name: "write" }]),
    setActiveToolsByName:
      overrides?.setActiveToolsByName ?? (() => undefined),
    setToolContext: overrides?.setToolContext ?? (() => undefined),
    state: overrides?.state ?? { messages: [] },
    subscribe: overrides?.subscribe ?? (() => () => undefined),
    dispose: overrides?.dispose ?? (() => undefined),
  }
}

function createRuntime(createSessionImpl?: AgentRuntime["createSession"]): AgentRuntime {
  return {
    createSession:
      createSessionImpl ??
      (async () =>
        createSession()),
  }
}

test("WorkflowEngine runs stages sequentially and passes previous output", async () => {
  const prompts: string[] = []
  const messagesByPrompt = new Map<string, string>([
    ["topic=Aether previous=", "first output"],
    ["follow=first output", "second output"],
  ])

  const session = createSession({
    prompt: async (prompt) => {
      prompts.push(prompt)
      session.state.messages = [
        {
          role: "assistant",
          content: [{ type: "text", text: messagesByPrompt.get(prompt) ?? "" }],
        },
      ]
    },
  })

  const workflow: WorkflowDefinition = {
    name: "demo",
    stages: [
      { id: "first", prompt: "topic={{topic}} previous={{previous}}" },
      { id: "second", prompt: "follow={{previous}}" },
    ],
  }

  const engine = new WorkflowEngine({
    runtime: createRuntime(async () => session),
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

  const session = createSession({
    prompt: async (prompt) => {
      prompts.push(prompt)
      if (prompt.startsWith("two")) {
        throw new Error("boom")
      }
      session.state.messages = [
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: prompt.startsWith("three") ? "third ok" : "first ok",
            },
          ],
        },
      ]
    },
  })

  const workflow: WorkflowDefinition = {
    name: "demo",
    stages: [
      { id: "first", prompt: "one" },
      { id: "second", prompt: "two {{previous}}" },
      { id: "third", prompt: "three {{previous}}" },
    ],
  }

  const engine = new WorkflowEngine({
    runtime: createRuntime(async () => session),
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
  const session = createSession({
    prompt: async () => {
      session.state.messages = [
        {
          role: "assistant",
          content: [{ type: "text", text: "done" }],
        },
      ]
    },
  })

  const workflow: WorkflowDefinition = {
    name: "demo",
    stages: [
      { id: "broken", prompt: "hello {{missing}}" },
      { id: "final", prompt: "done {{previous}}" },
    ],
  }

  const engine = new WorkflowEngine({
    runtime: createRuntime(async () => session),
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

test("WorkflowEngine injects stage tool context before prompting", async () => {
  const observedContexts: Array<{ baseDir?: string; sharedDir?: string }> = []

  const session = createSession({
    setToolContext: (context) => {
      observedContexts.push({
        baseDir: context.baseDir,
        sharedDir: context.sharedDir,
      })
    },
    prompt: async () => {
      session.state.messages = [
        {
          role: "assistant",
          content: [{ type: "text", text: "done" }],
        },
      ]
    },
  })

  const workflow: WorkflowDefinition = {
    name: "demo",
    stages: [{ id: "gather", prompt: "one" }],
  }

  const engine = new WorkflowEngine({
    runtime: createRuntime(async () => session),
  })

  await engine.run(workflow, {
    runDir: "/tmp/aether/.aether/runs/demo_20260517",
    sharedDir: "/tmp/aether/.aether/runs/demo_20260517/workspace/shared",
  })

  assert.deepEqual(observedContexts, [
    {
      baseDir: "/tmp/aether/.aether/runs/demo_20260517/workspace/stages/0",
      sharedDir: "/tmp/aether/.aether/runs/demo_20260517/workspace/shared",
    },
  ])
})

test("WorkflowEngine injects workflow run context into template variables", async () => {
  const prompts: string[] = []
  const session = createSession({
    prompt: async (prompt) => {
      prompts.push(prompt)
      session.state.messages = [
        {
          role: "assistant",
          content: [{ type: "text", text: "done" }],
        },
      ]
    },
  })

  const workflow: WorkflowDefinition = {
    name: "demo",
    stages: [
      { id: "gather", prompt: "workflow={{workflowName}} run={{runId}} dir={{runDir}}" },
    ],
  }

  const engine = new WorkflowEngine({
    runtime: createRuntime(async () => session),
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
  let listener: ((event: import("../../packages/core/src/agent/index.js").AgentEvent) => void) | undefined

  const session = createSession({
    prompt: async () => {
      listener?.({
        type: "tool_execution_start",
        toolName: "write",
        args: { path: "report.md" },
      })
      listener?.({
        type: "tool_execution_end",
        toolName: "write",
        args: { path: "report.md" },
        result: {
          content: [{ type: "text", text: "done" }],
        },
        isError: false,
      })
      session.state.messages = [
        {
          role: "assistant",
          content: [{ type: "text", text: "done" }],
        },
      ]
    },
    subscribe: (nextListener) => {
      listener = nextListener
      return () => undefined
    },
  })

  const workflow: WorkflowDefinition = {
    name: "demo",
    stages: [{ id: "gather", prompt: "one", tools: ["write"] }],
  }

  const engine = new WorkflowEngine({
    runtime: createRuntime(async () => session),
  })

  await engine.run(workflow, {
    runId: "run_test",
    onEvent: ((event: AetherRunEvent) => {
      events.push(event)
    }) as (event: unknown) => void,
  })

  assert.deepEqual(
    events.map((event) => event.type),
    [
      "session.created",
      "workflow.started",
      "stage.started",
      "stage.tools.activated",
      "stage.turn.started",
      "tool.started",
      "tool.finished",
      "stage.finished",
      "workflow.finished",
    ]
  )
  assert.ok(events.every((event) => event.runId === "run_test"))
})
