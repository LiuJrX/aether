import test from "node:test"
import assert from "node:assert/strict"

import {
  parseWorkflow,
  WorkflowValidationError,
} from "../../packages/workflow/src/loader.js"

test("parseWorkflow parses a valid workflow", () => {
  const workflow = parseWorkflow(`
name: demo
description: sample
stages:
  - id: first
    prompt: hello
    tools:
      - write
`)

  assert.equal(workflow.name, "demo")
  assert.equal(workflow.description, "sample")
  assert.equal(workflow.stages.length, 1)
  assert.deepEqual(workflow.stages[0], {
    id: "first",
    prompt: "hello",
    tools: ["write"],
  })
})

test("parseWorkflow rejects missing name", () => {
  assert.throws(
    () =>
      parseWorkflow(`
stages:
  - id: first
    prompt: hello
`),
    (error: unknown) =>
      error instanceof WorkflowValidationError &&
      error.message === "workflow.name is required"
  )
})

test("parseWorkflow rejects missing stage id", () => {
  assert.throws(
    () =>
      parseWorkflow(`
name: demo
stages:
  - prompt: hello
`),
    (error: unknown) =>
      error instanceof WorkflowValidationError &&
      error.message === "stages[0].id is required"
  )
})
