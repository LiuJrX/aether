import { buildCoreTools } from "./core-tools.js"
import { buildPiTools } from "./pi-tools.js"
import { loadRemoteMcpConfigs } from "./config.js"
import { discoverRemoteMcpTools } from "./discovery.js"
import type { RemoteMcpDiscoveryResult } from "./types.js"

export async function loadRemoteMcpTools(): Promise<RemoteMcpDiscoveryResult> {
  const configs = loadRemoteMcpConfigs()

  if (configs.length === 0) {
    return {
      tools: [],
      coreTools: [],
      customTools: [],
      dispose: async () => undefined,
    }
  }

  const { clients, tools } = await discoverRemoteMcpTools(configs)
  const clientsByServer = new Map(
    clients.map((client, index) => [configs[index]?.name ?? `server-${index}`, client])
  )

  return {
    tools,
    coreTools: buildCoreTools(tools, clientsByServer),
    customTools: buildPiTools(tools, clientsByServer),
    dispose: async () => {
      await Promise.all(clients.map((client) => client.dispose()))
    },
  }
}
