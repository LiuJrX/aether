import path from "node:path"
import { pathToFileURL } from "node:url"

import { createWorkflowRunByName, type WorkflowRunHandle } from "@aether/sdk"

import { createCliPresenter, printStageSummary } from "./presenter.js"

function resolveLogLevel(): "quiet" | "normal" | "verbose" {
  const value = process.env.AETHER_LOG_LEVEL?.trim().toLowerCase()
  if (value === "quiet" || value === "normal" || value === "verbose") {
    return value
  }

  return "normal"
}

function resolveOutputFormat(): "summary" | "json" {
  const value = process.env.AETHER_OUTPUT_FORMAT?.trim().toLowerCase()
  return value === "json" ? "json" : "summary"
}

export async function runCli(
  argv: string[],
  dependencies: {
    cwd?: string
    createWorkflowRunByNameImpl?: typeof createWorkflowRunByName
    io?: Pick<typeof console, "log" | "error">
  } = {}
): Promise<number> {
  const io = dependencies.io ?? console
  const cwd = dependencies.cwd ?? process.cwd()
  const runWorkflow = dependencies.createWorkflowRunByNameImpl ?? createWorkflowRunByName

  const [command, workflowName] = argv
  if (command !== "run" || !workflowName) {
    io.error("Usage: aether run workflow_name")
    return 1
  }

  const presenter = createCliPresenter(resolveLogLevel(), {
    log: io.log,
    write: (text) => process.stdout.write(text),
  })

  try {
    const workflowRun: WorkflowRunHandle = runWorkflow(workflowName, { cwd })
    const unsubscribe = workflowRun.subscribe(presenter)
    const result = await workflowRun.result
    unsubscribe()

    if (resolveOutputFormat() === "json") {
      io.log(JSON.stringify(result, null, 2))
    } else {
      printStageSummary(result, { log: io.log })
    }

    io.log(`\nRun directory: ${workflowRun.runDir}`)

    return result.ok ? 0 : 1
  } catch (error) {
    io.error(error instanceof Error ? error.message : "Unknown error")
    return 1
  }
}

if (process.argv[1]) {
  const isMainModule =
    import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

  if (isMainModule) {
    const exitCode = await runCli(process.argv.slice(2))
    process.exit(exitCode)
  }
}
