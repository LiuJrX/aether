import assert from "node:assert/strict"
import test from "node:test"

import { createWriteTool } from "../../packages/core/src/index.js"
import { adaptToolFactoryToAgentTool } from "../../packages/pi/src/tool-adapter.js"

test("adaptToolFactoryToAgentTool uses the latest runtime context for execution", async () => {
  let baseDir = "/tmp/workspace/stages/0"
  const writes: string[] = []

  const agentTool = adaptToolFactoryToAgentTool(
    (ctx) =>
      createWriteTool(ctx.baseDir ?? "", {
        operations: {
          mkdir: async () => undefined,
          writeFile: async (absolutePath) => {
            writes.push(absolutePath)
          },
        },
      }),
    () => ({
      cwd: "/tmp/workspace",
      baseDir,
    })
  )

  await agentTool.execute(
    "tool_call_1",
    { path: "report.md", content: "hello" },
    undefined,
    undefined
  )

  baseDir = "/tmp/workspace/stages/1"
  await agentTool.execute(
    "tool_call_2",
    { path: "report.md", content: "hello" },
    undefined,
    undefined
  )

  assert.deepEqual(writes, [
    "/tmp/workspace/stages/0/report.md",
    "/tmp/workspace/stages/1/report.md",
  ])
})
