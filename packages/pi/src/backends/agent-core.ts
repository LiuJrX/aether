import {
  Agent,
  createModelContext,
  createToolRegistry,
  createReadTool,
  createWriteTool,
  type AgentSession,
  type AgentSessionOptions,
  type AgentTool,
  type ToolContext,
  type ToolDefinition,
} from "../../../core/src/index.js"

import { loadRemoteMcpTools } from "../../../../extensions/remote-mcp/index.js"
import { adaptToolFactoryToAgentTool } from "../tool-adapter.js"

export async function createAgentCoreSession(
  options: AgentSessionOptions
): Promise<AgentSession> {
  const cwd = options.cwd ?? process.cwd()
  const fallbackDir = cwd
  const modelContext = await createModelContext({
    cwd,
    timeoutSeconds: options.timeoutSeconds,
  })
  if (!modelContext) {
    throw new Error("Model config not found in project .env")
  }

  let toolContext: ToolContext = {
    cwd,
    baseDir: fallbackDir,
    sharedDir: undefined,
    model: modelContext.modelConfig,
  }

  function createToolContext(): ToolContext {
    return toolContext
  }

  function createBuiltinTools(): AgentTool[] {
    return [
      adaptToolFactoryToAgentTool(
        (ctx) => createWriteTool(ctx.baseDir ?? fallbackDir),
        createToolContext
      ),
      adaptToolFactoryToAgentTool(
        (ctx) => {
          const targetDir = ctx.baseDir ?? fallbackDir
          const readableRoots = Array.from(
            new Set(
              [targetDir, ctx.sharedDir].filter(
                (value): value is string => Boolean(value)
              )
            )
          )
          return createReadTool(targetDir, { allowedRoots: readableRoots })
        },
        createToolContext
      ),
    ]
  }

  const remoteMcp = await loadRemoteMcpTools()
  const allTools = [
    ...createBuiltinTools(),
    ...remoteMcp.coreTools.map((tool) =>
      adaptToolFactoryToAgentTool(
        () => tool as ToolDefinition,
        createToolContext
      )
    ),
  ]
  const toolRegistry = createToolRegistry(allTools)

  const agent = new Agent({
    initialState: {
      model: modelContext,
      systemPrompt: options.systemPrompt ?? "",
      tools: toolRegistry.getActiveTools(),
      toolContext,
    },
  })

  const session = agent.toSession(
    toolRegistry.getAllTools(),
    toolRegistry.getActiveTools()
  )
  const baseSetToolContext = session.setToolContext
  const baseSetActiveToolsByName = session.setActiveToolsByName

  session.setToolContext = (context) => {
    toolContext = {
      ...toolContext,
      ...context,
    }
    baseSetToolContext(context)
  }
  session.setActiveToolsByName = (toolNames) => {
    const activeTools = toolRegistry.setActiveToolsByName(toolNames)
    agent.setTools(activeTools)
    baseSetActiveToolsByName(toolNames)
  }

  return session
}
