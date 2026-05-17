import test from "node:test"
import assert from "node:assert/strict"

import { runTask } from "../../packages/pi/src/run-task.js"
import type { PiSession } from "../../packages/pi/src/types.js"

test("runTask activates only allowed tools for the current stage", async () => {
  const activeTools: string[][] = []

  const session: PiSession = {
    session: {
      prompt: async () => undefined,
      getActiveToolNames: () => ["read", "write", "mcp.github.get_me"],
      getAllTools: () => [
        { name: "read" },
        { name: "write" },
        { name: "mcp.github.get_me" },
      ],
      setActiveToolsByName: (toolNames) => {
        activeTools.push(toolNames)
      },
      state: {
        messages: [
          {
            role: "assistant",
            content: [{ type: "text", text: "done" }],
          },
        ],
      },
      subscribe: () => () => undefined,
      dispose: () => undefined,
    },
    defaultToolNames: ["read", "write", "mcp.github.get_me"],
    workflowName: "demo",
    currentTurnIndex: 0,
    currentToolCallIndex: 0,
    currentTurnOpen: false,
  }

  const result = await runTask(session, {
    prompt: "hello",
    allowedTools: ["mcp.github.get_me"],
    workflowName: "demo",
    stageIndex: 0,
    stageDir: "/tmp/demo/workspace/stages/0",
    runId: "run_test",
  })

  assert.equal(result.ok, true)
  assert.equal(result.output, "done")
  assert.deepEqual(activeTools, [["mcp.github.get_me"]])
})

test("runTask expands provider-level MCP tools", async () => {
  const activeTools: string[][] = []

  const session: PiSession = {
    session: {
      prompt: async () => undefined,
      getActiveToolNames: () => [
        "read",
        "mcp.github.get_me",
        "mcp.github.search_code",
        "mcp.serpapi.search",
      ],
      getAllTools: () => [
        { name: "read" },
        { name: "mcp.github.get_me" },
        { name: "mcp.github.search_code" },
        { name: "mcp.serpapi.search" },
      ],
      setActiveToolsByName: (toolNames) => {
        activeTools.push(toolNames)
      },
      state: {
        messages: [
          {
            role: "assistant",
            content: [{ type: "text", text: "done" }],
          },
        ],
      },
      subscribe: () => () => undefined,
      dispose: () => undefined,
    },
    defaultToolNames: [
      "read",
      "mcp.github.get_me",
      "mcp.github.search_code",
      "mcp.serpapi.search",
    ],
    workflowName: "demo",
    currentTurnIndex: 0,
    currentToolCallIndex: 0,
    currentTurnOpen: false,
  }

  const result = await runTask(session, {
    prompt: "hello",
    allowedTools: ["mcp:github"],
    workflowName: "demo",
    stageIndex: 0,
    stageDir: "/tmp/demo/workspace/stages/0",
    runId: "run_test",
  })

  assert.equal(result.ok, true)
  assert.deepEqual(activeTools, [[
    "mcp.github.get_me",
    "mcp.github.search_code",
  ]])
})

test("runTask expands wildcard MCP tools alongside builtin tools", async () => {
  const activeTools: string[][] = []

  const session: PiSession = {
    session: {
      prompt: async () => undefined,
      getActiveToolNames: () => [
        "write",
        "mcp.serpapi.search",
        "mcp.serpapi.search_news",
        "mcp.github.get_me",
      ],
      getAllTools: () => [
        { name: "write" },
        { name: "mcp.serpapi.search" },
        { name: "mcp.serpapi.search_news" },
        { name: "mcp.github.get_me" },
      ],
      setActiveToolsByName: (toolNames) => {
        activeTools.push(toolNames)
      },
      state: {
        messages: [
          {
            role: "assistant",
            content: [{ type: "text", text: "done" }],
          },
        ],
      },
      subscribe: () => () => undefined,
      dispose: () => undefined,
    },
    defaultToolNames: [
      "write",
      "mcp.serpapi.search",
      "mcp.serpapi.search_news",
      "mcp.github.get_me",
    ],
    workflowName: "demo",
    currentTurnIndex: 0,
    currentToolCallIndex: 0,
    currentTurnOpen: false,
  }

  const result = await runTask(session, {
    prompt: "hello",
    allowedTools: ["write", "mcp.serpapi.*"],
    workflowName: "demo",
    stageIndex: 0,
    stageDir: "/tmp/demo/workspace/stages/0",
    runId: "run_test",
  })

  assert.equal(result.ok, true)
  assert.deepEqual(activeTools, [[
    "write",
    "mcp.serpapi.search",
    "mcp.serpapi.search_news",
  ]])
})

test("runTask tracks the current stage while prompting", async () => {
  const observedStageIds: Array<string | undefined> = []

  const session: PiSession = {
    session: {
      prompt: async () => {
        observedStageIds.push(session.currentStageId)
      },
      getActiveToolNames: () => ["write"],
      getAllTools: () => [{ name: "write" }],
      setActiveToolsByName: () => undefined,
      state: {
        messages: [
          {
            role: "assistant",
            content: [{ type: "text", text: "done" }],
          },
        ],
      },
      subscribe: () => () => undefined,
      dispose: () => undefined,
    },
    defaultToolNames: ["write"],
    workflowName: "demo",
    currentStageId: undefined,
    currentTurnIndex: 0,
    currentToolCallIndex: 0,
    currentTurnOpen: false,
  }

  const result = await runTask(session, {
    prompt: "hello",
    allowedTools: ["write"],
    stageId: "gather",
    workflowName: "demo",
    stageIndex: 0,
    stageDir: "/tmp/demo/workspace/stages/0",
    runId: "run_test",
  })

  assert.equal(result.ok, true)
  assert.deepEqual(observedStageIds, ["gather"])
  assert.equal(session.currentStageId, undefined)
})
