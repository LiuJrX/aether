import type { RemoteMcpClient } from "./client.js"
import type {
  RemoteMcpCallResult,
  RemoteMcpCustomTool,
  RemoteMcpDiscoveredTool,
} from "./types.js"

function toToolContent(result: RemoteMcpCallResult): Array<{ type: "text"; text: string }> {
  if (Array.isArray(result.content) && result.content.length > 0) {
    const textContent = result.content.flatMap((item) => {
      if (item.type !== "text" || typeof item.text !== "string") {
        return []
      }

      return [{ type: "text" as const, text: item.text }]
    })

    if (textContent.length > 0) {
      return textContent
    }
  }

  return [
    {
      type: "text",
      text: JSON.stringify(result, null, 2),
    },
  ]
}

export function buildCoreTools(
  tools: RemoteMcpDiscoveredTool[],
  clientsByServer: Map<string, RemoteMcpClient>
): RemoteMcpCustomTool[] {
  return tools.map((tool) => {
    const client = clientsByServer.get(tool.serverName)

    if (!client) {
      throw new Error(`No MCP client available for ${tool.serverName}`)
    }

    return {
      name: tool.namespacedName,
      label: tool.namespacedName,
      description: tool.description,
      parameters: tool.inputSchema,
      async execute(
        _toolCallId: string,
        params: Record<string, unknown>,
        signal: AbortSignal | undefined
      ) {
        const result = await client.callTool(tool.originalName, params, signal)

        return {
          content: toToolContent(result),
          details: {
            server: tool.serverName,
            tool: tool.originalName,
            namespacedTool: tool.namespacedName,
            raw: result,
          },
        }
      },
    }
  })
}
