import fs from "node:fs/promises"

import YAML from "yaml"

import type {
  WorkflowDefinition,
  WorkflowStageDefinition,
} from "./types.js"

export class WorkflowValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorkflowValidationError"
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function validateStage(stage: unknown, index: number): WorkflowStageDefinition {
  if (typeof stage !== "object" || stage === null) {
    throw new WorkflowValidationError(`stages[${index}] must be an object`)
  }

  const { id, prompt, tools } = stage as {
    id?: unknown
    prompt?: unknown
    tools?: unknown
  }

  if (!isNonEmptyString(id)) {
    throw new WorkflowValidationError(`stages[${index}].id is required`)
  }

  if (!isNonEmptyString(prompt)) {
    throw new WorkflowValidationError(`stages[${index}].prompt is required`)
  }

  if (
    tools !== undefined &&
    (!Array.isArray(tools) ||
      tools.some((tool) => !isNonEmptyString(tool)))
  ) {
    throw new WorkflowValidationError(
      `stages[${index}].tools must be an array of non-empty strings`
    )
  }

  return {
    id,
    prompt,
    tools,
  }
}

export function parseWorkflow(yamlStr: string): WorkflowDefinition {
  const parsed = YAML.parse(yamlStr) as {
    name?: unknown
    description?: unknown
    stages?: unknown
  }

  if (!isNonEmptyString(parsed?.name)) {
    throw new WorkflowValidationError("workflow.name is required")
  }

  if (!Array.isArray(parsed.stages) || parsed.stages.length === 0) {
    throw new WorkflowValidationError("workflow.stages must be a non-empty array")
  }

  if (
    parsed.description !== undefined &&
    typeof parsed.description !== "string"
  ) {
    throw new WorkflowValidationError("workflow.description must be a string")
  }

  return {
    name: parsed.name,
    description: parsed.description,
    stages: parsed.stages.map((stage, index) => validateStage(stage, index)),
  }
}

export async function loadWorkflowFromFile(
  filePath: string
): Promise<WorkflowDefinition> {
  const yamlStr = await fs.readFile(filePath, "utf8")
  return parseWorkflow(yamlStr)
}
