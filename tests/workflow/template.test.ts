import test from "node:test"
import assert from "node:assert/strict"

import {
  renderTemplate,
  TemplateError,
} from "../../packages/workflow/src/template.js"

test("renderTemplate replaces variables", () => {
  const result = renderTemplate("Hello {{ topic }} - {{previous}}", {
    topic: "Aether",
    previous: "done",
  })

  assert.equal(result, "Hello Aether - done")
})

test("renderTemplate throws for missing variables", () => {
  assert.throws(
    () => renderTemplate("Hello {{topic}}", { previous: "done" }),
    (error: unknown) =>
      error instanceof TemplateError &&
      error.message ===
        'Variable "{{topic}}" is not defined.\nProvided variables: previous'
  )
})
