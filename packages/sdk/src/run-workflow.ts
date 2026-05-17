import fs from "node:fs/promises"
import path from "node:path"

import type { RuntimeBackend } from "@aether/core"
import {
  createEventBus,
  createRunId,
  type AetherRunEvent,
  type AetherRunEventHandler,
} from "@aether/observer"
import {
  createFileSystemRunStorage,
  resolveRunDirectories,
} from "@aether/storage"
import { createRuntime } from "@aether/pi"
import {
  loadWorkflowFromFile,
  WorkflowEngine,
  type WorkflowDefinition,
  type WorkflowRunOptions,
  type WorkflowRunResult,
} from "@aether/workflow"

export interface SdkWorkflowRunOptions
  extends Omit<WorkflowRunOptions, "runId" | "workflowName" | "runDir" | "onEvent"> {
  runId?: string
  backend?: RuntimeBackend
  onEvent?: AetherRunEventHandler
}

export interface WorkflowRunHandle {
  workflowName: string
  runId: string
  runDir: string
  result: Promise<WorkflowRunResult>
  subscribe: (handler: AetherRunEventHandler) => () => void
}

function toAgentEventHandler(
  onEvent?: AetherRunEventHandler
): ((event: unknown) => void) | undefined {
  return onEvent as ((event: unknown) => void) | undefined
}

function resolveCwd(cwd?: string): string {
  return cwd ?? process.cwd()
}

function resolveWorkflowFilePath(workflowName: string, cwd?: string): string {
  const baseCwd = resolveCwd(cwd)
  return path.resolve(
    baseCwd,
    ".aether/workflows",
    workflowName,
    `${workflowName}.workflow.yaml`
  )
}

async function ensureWorkflowExists(filePath: string): Promise<void> {
  try {
    await fs.access(filePath)
  } catch {
    throw new Error(
      `Workflow not found at ${filePath}. Expected /.aether/workflows/<workflow_name>/<workflow_name>.workflow.yaml`
    )
  }
}

function createWorkflowRunHandle(
  workflowName: string,
  runId: string,
  runDir: string,
  eventHandler?: AetherRunEventHandler
): {
  handle: Pick<WorkflowRunHandle, "workflowName" | "runId" | "runDir" | "subscribe">
  publish: (event: AetherRunEvent) => void
} {
  const eventBus = createEventBus(runId, eventHandler)

  return {
    handle: {
      workflowName,
      runId,
      runDir,
      subscribe: eventBus.subscribe,
    },
    publish: eventBus.publish,
  }
}

export function createWorkflowRun(
  workflow: WorkflowDefinition,
  options: SdkWorkflowRunOptions = {}
): WorkflowRunHandle {
  const cwd = resolveCwd(options.cwd)
  const workflowName = workflow.name
  const runId = options.runId ?? createRunId()
  const directories = resolveRunDirectories(cwd, workflowName, runId)
  const engine = new WorkflowEngine({
    cwd,
    runtime: createRuntime({ backend: options.backend }),
  })
  const { handle, publish } = createWorkflowRunHandle(
    workflowName,
    runId,
    directories.runDir,
    options.onEvent
  )

  return {
    ...handle,
    result: (async () => {
      const storage = await createFileSystemRunStorage({
        cwd,
        workflowName,
        runId,
      })
      const publishWithStorage = (event: AetherRunEvent) => {
        void storage.recordEvent(event)
        publish(event)
      }
      const result = await engine.run(workflow, {
        variables: options.variables,
        cwd,
        workflowName,
        runId,
        runDir: storage.runDir,
        sharedDir: storage.sharedDir,
        onEvent: toAgentEventHandler(publishWithStorage),
      })
      await storage.flush()
      return result
    })(),
  }
}

export function createWorkflowRunFromFile(
  filePath: string,
  options: SdkWorkflowRunOptions = {}
): WorkflowRunHandle {
  const cwd = resolveCwd(options.cwd)
  const workflowName = path.basename(filePath, ".workflow.yaml")
  const runId = options.runId ?? createRunId()
  const directories = resolveRunDirectories(cwd, workflowName, runId)
  const { handle, publish } = createWorkflowRunHandle(
    workflowName,
    runId,
    directories.runDir,
    options.onEvent
  )

  return {
    ...handle,
    result: (async () => {
      await ensureWorkflowExists(filePath)
      const storage = await createFileSystemRunStorage({
        cwd,
        workflowName,
        runId,
      })
      const workflow = await loadWorkflowFromFile(filePath)
      const engine = new WorkflowEngine({
        cwd,
        runtime: createRuntime({ backend: options.backend }),
      })
      const publishWithStorage = (event: AetherRunEvent) => {
        void storage.recordEvent(event)
        publish(event)
      }

      const result = await engine.run(workflow, {
        variables: options.variables,
        cwd,
        workflowName,
        runId,
        runDir: storage.runDir,
        sharedDir: storage.sharedDir,
        onEvent: toAgentEventHandler(publishWithStorage),
      })
      await storage.flush()
      return result
    })(),
  }
}

export function createWorkflowRunByName(
  workflowName: string,
  options: SdkWorkflowRunOptions = {}
): WorkflowRunHandle {
  const filePath = resolveWorkflowFilePath(workflowName, options.cwd)
  const cwd = resolveCwd(options.cwd)
  const runId = options.runId ?? createRunId()
  const directories = resolveRunDirectories(cwd, workflowName, runId)
  const { handle, publish } = createWorkflowRunHandle(
    workflowName,
    runId,
    directories.runDir,
    options.onEvent
  )

  return {
    ...handle,
    result: (async () => {
      await ensureWorkflowExists(filePath)
      const storage = await createFileSystemRunStorage({
        cwd,
        workflowName,
        runId,
      })
      const workflow = await loadWorkflowFromFile(filePath)
      const engine = new WorkflowEngine({
        cwd,
        runtime: createRuntime({ backend: options.backend }),
      })
      const publishWithStorage = (event: AetherRunEvent) => {
        void storage.recordEvent(event)
        publish(event)
      }

      const result = await engine.run(workflow, {
        variables: options.variables,
        cwd,
        workflowName,
        runId,
        runDir: storage.runDir,
        sharedDir: storage.sharedDir,
        onEvent: toAgentEventHandler(publishWithStorage),
      })
      await storage.flush()
      return result
    })(),
  }
}

export async function runWorkflow(
  workflow: WorkflowDefinition,
  options?: SdkWorkflowRunOptions
): Promise<WorkflowRunResult> {
  return createWorkflowRun(workflow, options).result
}

export async function runWorkflowFromFile(
  filePath: string,
  options?: SdkWorkflowRunOptions
): Promise<WorkflowRunResult> {
  return createWorkflowRunFromFile(filePath, options).result
}

export async function runWorkflowByName(
  workflowName: string,
  options?: SdkWorkflowRunOptions
): Promise<WorkflowRunResult> {
  return createWorkflowRunByName(workflowName, options).result
}

export { resolveWorkflowFilePath }
