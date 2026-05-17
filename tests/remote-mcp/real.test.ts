import test from "node:test"
import assert from "node:assert/strict"

import { loadProjectEnv } from "../../packages/pi/src/env.js"
import { loadRemoteMcpConfigs } from "../../extensions/remote-mcp/config.js"
import { RemoteMcpClient } from "../../extensions/remote-mcp/client.js"

await loadProjectEnv(process.cwd())

function maybeSkip(): string | undefined {
  if (
    !process.env.SERPAPI_MCP_URL ||
    !process.env.SERPAPI_API_KEY ||
    !process.env.GITHUB_MCP_URL ||
    !process.env.GITHUB_PERSONAL_ACCESS_TOKEN
  ) {
    return "Remote MCP credentials are not configured in .env"
  }

  return undefined
}

test("real SerpApi MCP supports tools/list and a readonly search call", async (t) => {
  const skipReason = maybeSkip()
  if (skipReason) {
    t.skip(skipReason)
    return
  }

  const serpapi = loadRemoteMcpConfigs().find((config) => config.name === "serpapi")
  assert.ok(serpapi)

  const client = new RemoteMcpClient(serpapi)
  const tools = await client.listTools()
  assert.ok(tools.length > 0)

  const result = await client.callTool("search", {
    params: {
      q: "OpenAI",
      engine: "google_light",
    },
    mode: "compact",
  })

  assert.ok(Array.isArray(result.content))
  await client.dispose()
})

test("real GitHub MCP supports tools/list and a readonly tool call", async (t) => {
  const skipReason = maybeSkip()
  if (skipReason) {
    t.skip(skipReason)
    return
  }

  const github = loadRemoteMcpConfigs().find((config) => config.name === "github")
  assert.ok(github)

  const client = new RemoteMcpClient(github)
  const tools = await client.listTools()
  assert.ok(tools.some((tool) => tool.name === "get_me"))

  const result = await client.callTool("get_me", {})
  assert.ok(Array.isArray(result.content))
  await client.dispose()
})
