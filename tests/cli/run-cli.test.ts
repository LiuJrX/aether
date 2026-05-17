import test from "node:test"
import assert from "node:assert/strict"

import { runCli } from "../../packages/cli/src/index.js"
import type { WorkflowRunHandle } from "../../packages/sdk/src/run-workflow.js"

test("runCli shows usage for missing workflow name", async () => {
  const errors: string[] = []

  const exitCode = await runCli([], {
    io: {
      log: () => undefined,
      error: (message: string) => {
        errors.push(message)
      },
    },
  })

  assert.equal(exitCode, 1)
  assert.deepEqual(errors, ["Usage: aether run workflow_name"])
})

test("runCli runs a workflow by name through the SDK handle", async () => {
  const logs: string[] = []

  const exitCode = await runCli(["run", "research"], {
    cwd: "/tmp/aether-cli",
    io: {
      log: (message: string) => {
        logs.push(message)
      },
      error: (message: string) => {
        logs.push(message)
      },
    },
    createWorkflowRunByNameImpl: (workflowName) =>
      ({
        workflowName,
        runId: "202605171430009999",
        runDir: `/tmp/aether-cli/.aether/runs/${workflowName}_202605171430009999`,
        subscribe: () => () => undefined,
        result: Promise.resolve({
          name: workflowName,
          ok: true,
          stages: [
            {
              id: "gather",
              ok: true,
              output: "done",
            },
          ],
        }),
      }) as WorkflowRunHandle,
  })

  assert.equal(exitCode, 0)
  assert.ok(logs.some((message) => message.includes("Workflow succeeded")))
  assert.ok(logs.some((message) => message.includes("Run directory:")))
})
