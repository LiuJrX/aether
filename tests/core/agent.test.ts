import assert from "node:assert/strict"
import test from "node:test"

import {
  Agent,
  createToolRegistry,
  type ModelContext,
} from "../../packages/core/src/index.js"

test("tool registry resolves provider and wildcard tool selections", () => {
  const registry = createToolRegistry([
    { name: "write" },
    { name: "mcp.github.get_me" },
    { name: "mcp.github.search_code" },
    { name: "mcp.serpapi.search" },
  ])

  assert.deepEqual(registry.getActiveToolNames(), [
    "write",
    "mcp.github.get_me",
    "mcp.github.search_code",
    "mcp.serpapi.search",
  ])
  assert.deepEqual(registry.resolveAllowedTools(["mcp:github"]), [
    "mcp.github.get_me",
    "mcp.github.search_code",
  ])
  assert.deepEqual(registry.resolveAllowedTools(["write", "mcp.serpapi.*"]), [
    "write",
    "mcp.serpapi.search",
  ])
})

test("Agent runs a prompt, executes a tool, and appends tool results", async () => {
  const events: string[] = []

  const model: ModelContext = {
    modelConfig: {
      apiKey: "test",
      baseUrl: "https://example.com/v1",
      model: "demo",
    },
    providerConfig: {
      apiKey: "test",
      baseUrl: "https://example.com/v1",
    },
    provider: {
      async stream(request) {
        const lastToolMessage = [...request.messages]
          .reverse()
          .find((message) => message.role === "tool")

        if (!lastToolMessage) {
          request.onEvent?.({
            type: "text_delta",
            delta: "Calling tool",
          })
          return {
            role: "assistant",
            content: [
              { type: "text", text: "Calling tool" },
              {
                type: "toolCall",
                id: "tool_call_1",
                toolName: "write",
                args: JSON.stringify({
                  path: "report.md",
                  content: "hello",
                }),
              },
            ],
            stopReason: "tool_calls",
          }
        }

        request.onEvent?.({
          type: "text_delta",
          delta: "Finished",
        })
        return {
          role: "assistant",
          content: [{ type: "text", text: "Finished" }],
          stopReason: "stop",
        }
      },
    },
  }

  const writes: Array<Record<string, unknown>> = []
  const agent = new Agent({
    initialState: {
      model,
      systemPrompt: "",
      tools: [
        {
          name: "write",
          label: "write",
          description: "write",
          parameters: {} as never,
          async execute(_toolCallId, params) {
            writes.push(params as Record<string, unknown>)
            return {
              content: [{ type: "text", text: "ok" }],
              details: null,
            }
          },
        },
      ],
      toolContext: {
        cwd: process.cwd(),
        baseDir: process.cwd(),
      },
    },
  })

  const session = agent.toSession(agent.state.tools, agent.state.tools)
  session.subscribe((event) => {
    events.push(event.type)
  })

  await session.prompt("hello")

  assert.deepEqual(events, [
    "message_update",
    "message_end",
    "tool_execution_start",
    "tool_execution_end",
    "message_update",
    "message_end",
  ])
  assert.deepEqual(writes, [
    {
      path: "report.md",
      content: "hello",
    },
  ])
  assert.equal(session.state.messages.at(-1)?.role, "assistant")
})
