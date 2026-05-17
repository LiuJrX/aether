import type { RemoteMcpServerConfig } from "./types.js"

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue
  }

  const normalized = value.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false
  }

  return defaultValue
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "")
}

function buildSerpApiUrl(url: string, apiKey: string, authMode: string): string {
  const normalizedUrl = normalizeUrl(url)

  if (authMode !== "path") {
    return normalizedUrl
  }

  if (normalizedUrl.endsWith(`/${apiKey}/mcp`)) {
    return normalizedUrl
  }

  if (normalizedUrl.endsWith("/mcp")) {
    return normalizedUrl.replace(/\/mcp$/, `/${apiKey}/mcp`)
  }

  return `${normalizedUrl}/${apiKey}/mcp`
}

export function loadRemoteMcpConfigs(
  env: NodeJS.ProcessEnv = process.env
): RemoteMcpServerConfig[] {
  const enabled = parseBoolean(env.AETHER_MCP_ENABLED, true)
  if (!enabled) {
    return []
  }

  const configs: RemoteMcpServerConfig[] = []

  if (
    env.SERPAPI_MCP_URL?.trim() &&
    env.SERPAPI_API_KEY?.trim() &&
    env.SERPAPI_MCP_AUTH_MODE?.trim() === "path"
  ) {
    configs.push({
      name: "serpapi",
      url: buildSerpApiUrl(
        env.SERPAPI_MCP_URL,
        env.SERPAPI_API_KEY,
        env.SERPAPI_MCP_AUTH_MODE
      ),
      authMode: "path",
      readonly: false,
      authValue: env.SERPAPI_API_KEY.trim(),
      protocol: "json",
      toolPrefix: "mcp.serpapi",
    })
  }

  if (
    env.GITHUB_MCP_URL?.trim() &&
    env.GITHUB_PERSONAL_ACCESS_TOKEN?.trim() &&
    env.GITHUB_MCP_AUTH_MODE?.trim() === "pat"
  ) {
    configs.push({
      name: "github",
      url: normalizeUrl(env.GITHUB_MCP_URL),
      authMode: "pat",
      readonly: parseBoolean(env.GITHUB_MCP_READONLY, true),
      authValue: env.GITHUB_PERSONAL_ACCESS_TOKEN.trim(),
      protocol: "sse",
      toolPrefix: "mcp.github",
    })
  }

  return configs
}
