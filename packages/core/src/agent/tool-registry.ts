export interface NamedTool {
  name: string
}

export interface ToolRegistry<TTool extends NamedTool = NamedTool> {
  getAllTools(): TTool[]
  getAllToolNames(): string[]
  getActiveTools(): TTool[]
  getActiveToolNames(): string[]
  setActiveToolsByName(toolNames: string[]): TTool[]
  resolveAllowedTools(allowedTools?: string[]): string[]
}

function expandAllowedTools(
  allowedTools: string[] | undefined,
  allToolNames: string[],
  defaultToolNames: string[]
): string[] {
  if (!allowedTools || allowedTools.length === 0) {
    return allToolNames.length > 0 ? allToolNames : defaultToolNames
  }

  const resolved = new Set<string>()

  for (const toolName of allowedTools) {
    if (toolName.startsWith("mcp:")) {
      const provider = toolName.slice("mcp:".length).trim()
      if (provider.length === 0) {
        continue
      }

      const prefix = `mcp.${provider}.`
      for (const candidate of allToolNames) {
        if (candidate.startsWith(prefix)) {
          resolved.add(candidate)
        }
      }
      continue
    }

    const wildcardMatch = /^mcp\.([^.]+)\.\*$/.exec(toolName)
    if (wildcardMatch) {
      const provider = wildcardMatch[1]
      const prefix = `mcp.${provider}.`
      for (const candidate of allToolNames) {
        if (candidate.startsWith(prefix)) {
          resolved.add(candidate)
        }
      }
      continue
    }

    resolved.add(toolName)
  }

  return resolved.size > 0 ? [...resolved] : defaultToolNames
}

export function createToolRegistry<TTool extends NamedTool>(
  tools: TTool[],
  initialActiveToolNames?: string[]
): ToolRegistry<TTool> {
  const allTools = tools.slice()
  let activeTools =
    initialActiveToolNames && initialActiveToolNames.length > 0
      ? allTools.filter((tool) => initialActiveToolNames.includes(tool.name))
      : allTools.slice()

  return {
    getAllTools() {
      return allTools.slice()
    },
    getAllToolNames() {
      return allTools.map((tool) => tool.name)
    },
    getActiveTools() {
      return activeTools.slice()
    },
    getActiveToolNames() {
      return activeTools.map((tool) => tool.name)
    },
    setActiveToolsByName(toolNames: string[]) {
      const allowed = new Set(toolNames)
      activeTools = allTools.filter((tool) => allowed.has(tool.name))
      return activeTools.slice()
    },
    resolveAllowedTools(allowedTools?: string[]) {
      return expandAllowedTools(
        allowedTools,
        allTools.map((tool) => tool.name),
        activeTools.map((tool) => tool.name)
      )
    },
  }
}
