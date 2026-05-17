import type {
  RemoteMcpCallResult,
  RemoteMcpListedTool,
  RemoteMcpServerConfig,
} from "./types.js"

const MCP_PROTOCOL_VERSION = "2025-03-26"

interface JsonRpcSuccess<T> {
  jsonrpc: "2.0"
  id: string | number
  result: T
}

interface JsonRpcError {
  jsonrpc: "2.0"
  id: string | number | null
  error: {
    code: number
    message: string
  }
}

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcError

interface InitializeResult {
  protocolVersion: string
}

interface ToolsListResult {
  tools: RemoteMcpListedTool[]
  nextCursor?: string
}

interface ToolsCallResult extends RemoteMcpCallResult {}

function isJsonRpcError<T>(payload: JsonRpcResponse<T>): payload is JsonRpcError {
  return "error" in payload
}

function parseSsePayload<T>(body: string): JsonRpcResponse<T> {
  const dataLines = body
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6))

  if (dataLines.length === 0) {
    throw new Error("MCP SSE response did not contain any data payload.")
  }

  return JSON.parse(dataLines.join("\n")) as JsonRpcResponse<T>
}

function buildHeaders(
  config: RemoteMcpServerConfig,
  sessionId?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept:
      config.protocol === "sse"
        ? "application/json, text/event-stream"
        : "application/json",
  }

  if (config.authMode === "pat") {
    headers.authorization = `Bearer ${config.authValue}`
  }

  if (config.name === "github") {
    headers["x-mcp-readonly"] = String(config.readonly)
  }

  if (sessionId) {
    headers["mcp-session-id"] = sessionId
    headers["mcp-protocol-version"] = MCP_PROTOCOL_VERSION
  }

  return headers
}

export class RemoteMcpClient {
  private requestId = 0
  private initialized = false
  private sessionId?: string

  constructor(private readonly config: RemoteMcpServerConfig) {}

  private nextId(): number {
    this.requestId += 1
    return this.requestId
  }

  private async parseResponse<T>(response: Response): Promise<JsonRpcResponse<T>> {
    const contentType = response.headers.get("content-type") ?? ""
    const body = await response.text()

    if (!response.ok) {
      throw new Error(
        `MCP request failed for ${this.config.name}: ${response.status} ${body || "(no body)"}`
      )
    }

    if (contentType.includes("text/event-stream")) {
      return parseSsePayload<T>(body)
    }

    return JSON.parse(body) as JsonRpcResponse<T>
  }

  private async send<T>(
    method: string,
    params: Record<string, unknown>,
    options?: { signal?: AbortSignal; notification?: boolean }
  ): Promise<T | undefined> {
    const isNotification = options?.notification === true
    const payload = isNotification
      ? { jsonrpc: "2.0", method, params }
      : { jsonrpc: "2.0", id: this.nextId(), method, params }

    const response = await fetch(this.config.url, {
      method: "POST",
      headers: buildHeaders(
        this.config,
        this.initialized ? this.sessionId : undefined
      ),
      body: JSON.stringify(payload),
      signal: options?.signal,
    })

    if (!this.initialized) {
      this.sessionId = response.headers.get("mcp-session-id") ?? undefined
    }

    if (isNotification) {
      await response.text()
      return undefined
    }

    const parsed = await this.parseResponse<T>(response)
    if (isJsonRpcError(parsed)) {
      throw new Error(
        `MCP ${method} failed for ${this.config.name}: ${parsed.error.message}`
      )
    }

    return parsed.result
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.send<InitializeResult>("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "aether-remote-mcp",
        version: "0.1.0",
      },
    })

    this.initialized = true

    if (this.sessionId) {
      try {
        await this.send("notifications/initialized", {}, { notification: true })
      } catch {
        // Some servers ignore this notification. That's fine.
      }
    }
  }

  async listTools(signal?: AbortSignal): Promise<RemoteMcpListedTool[]> {
    await this.initialize()

    const tools: RemoteMcpListedTool[] = []
    let cursor: string | undefined

    do {
      const result = await this.send<ToolsListResult>(
        "tools/list",
        cursor ? { cursor } : {},
        { signal }
      )

      if (!result) {
        break
      }

      tools.push(...result.tools)
      cursor = result.nextCursor
    } while (cursor)

    return tools
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<ToolsCallResult> {
    await this.initialize()

    const result = await this.send<ToolsCallResult>(
      "tools/call",
      {
        name,
        arguments: args,
      },
      { signal }
    )

    if (!result) {
      throw new Error(`MCP tools/call returned no result for ${name}`)
    }

    return result
  }

  async dispose(): Promise<void> {
    if (!this.sessionId) {
      return
    }

    try {
      await fetch(this.config.url, {
        method: "DELETE",
        headers: buildHeaders(this.config, this.sessionId),
      })
    } catch {
      // Best-effort cleanup only.
    }
  }
}
