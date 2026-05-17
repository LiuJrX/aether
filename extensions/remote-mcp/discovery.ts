import { RemoteMcpClient } from "./client.js"
import type {
  RemoteMcpDiscoveredTool,
  RemoteMcpListedTool,
  RemoteMcpServerConfig,
} from "./types.js"

function isReadonlyTool(tool: RemoteMcpListedTool): boolean {
  return tool.annotations?.readOnlyHint === true
}

export async function discoverRemoteMcpTools(
  configs: RemoteMcpServerConfig[]
): Promise<{
  clients: RemoteMcpClient[]
  tools: RemoteMcpDiscoveredTool[]
}> {
  const clients = configs.map((config) => new RemoteMcpClient(config))
  const discoveredTools: RemoteMcpDiscoveredTool[] = []

  for (const [index, client] of clients.entries()) {
    const config = configs[index]
    if (!config) {
      continue
    }

    const listedTools = await client.listTools()
    const visibleTools = config.readonly
      ? listedTools.filter((tool) => isReadonlyTool(tool))
      : listedTools

    for (const tool of visibleTools) {
      discoveredTools.push({
        serverName: config.name,
        namespacedName: `${config.toolPrefix}.${tool.name}`,
        originalName: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema ?? {
          type: "object",
          properties: {},
          additionalProperties: true,
        },
        annotations: tool.annotations,
      })
    }
  }

  return {
    clients,
    tools: discoveredTools,
  }
}
