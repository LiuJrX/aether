import { createWorkflowRunByName, type WorkflowRunHandle } from "@aether/sdk"
import { createCliPresenter, printStageSummary } from "../packages/cli/src/presenter.js"

type OutputFormat = "summary" | "json"

function resolveOutputFormat(): OutputFormat {
  const value = process.env.AETHER_OUTPUT_FORMAT?.trim().toLowerCase()
  return value === "json" ? "json" : "summary"
}

const workflowRun: WorkflowRunHandle = createWorkflowRunByName("research", {
  cwd: process.cwd(),
  variables: {
    topic: "多模态",
  },
})

const unsubscribe = workflowRun.subscribe(
  createCliPresenter(
    process.env.AETHER_LOG_LEVEL === "quiet"
      ? "quiet"
      : process.env.AETHER_LOG_LEVEL === "verbose"
        ? "verbose"
        : "normal"
  )
)

const result = await workflowRun.result
unsubscribe()

if (resolveOutputFormat() === "json") {
  console.log(JSON.stringify(result, null, 2))
} else {
  printStageSummary(result)
}
console.log(`\nRun directory: ${workflowRun.runDir}`)
