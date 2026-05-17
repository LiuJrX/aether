import test from "node:test"
import assert from "node:assert/strict"

import { loadRemoteMcpConfigs } from "../../extensions/remote-mcp/config.js"

test("loadRemoteMcpConfigs parses SerpApi and GitHub providers", () => {
  const configs = loadRemoteMcpConfigs({
    SERPAPI_MCP_URL: "https://mcp.serpapi.com",
    SERPAPI_MCP_AUTH_MODE: "path",
    SERPAPI_API_KEY: "serp-key",
    GITHUB_MCP_URL: "https://api.githubcopilot.com/mcp/",
    GITHUB_MCP_AUTH_MODE: "pat",
    GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_test",
    GITHUB_MCP_READONLY: "true",
  })

  assert.deepEqual(
    configs.map((config) => ({
      name: config.name,
      url: config.url,
      authMode: config.authMode,
      readonly: config.readonly,
      protocol: config.protocol,
    })),
    [
      {
        name: "serpapi",
        url: "https://mcp.serpapi.com/serp-key/mcp",
        authMode: "path",
        readonly: false,
        protocol: "json",
      },
      {
        name: "github",
        url: "https://api.githubcopilot.com/mcp",
        authMode: "pat",
        readonly: true,
        protocol: "sse",
      },
    ]
  )
})

test("loadRemoteMcpConfigs respects disable flag", () => {
  const configs = loadRemoteMcpConfigs({
    AETHER_MCP_ENABLED: "false",
    SERPAPI_MCP_URL: "https://mcp.serpapi.com",
    SERPAPI_MCP_AUTH_MODE: "path",
    SERPAPI_API_KEY: "serp-key",
  })

  assert.deepEqual(configs, [])
})
