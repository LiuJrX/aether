export type RemoteMcpServerName = "github" | "serpapi"
export type RemoteMcpAuthMode = "path" | "pat"

export interface RemoteMcpServerConfig {
  name: RemoteMcpServerName
  url: string
  authMode: RemoteMcpAuthMode
  readonly: boolean
  authValue: string
  protocol: "json" | "sse"
  toolPrefix: string
}

export interface RemoteMcpToolAnnotations {
  readOnlyHint?: boolean
  title?: string
}

export interface RemoteMcpJsonSchema {
  type?: string
  properties?: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
  items?: unknown
  anyOf?: unknown[]
  oneOf?: unknown[]
  description?: string
  enum?: unknown[]
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  minItems?: number
  maxItems?: number
  default?: unknown
}

export interface RemoteMcpListedTool {
  name: string
  description: string
  inputSchema?: RemoteMcpJsonSchema
  annotations?: RemoteMcpToolAnnotations
}

export interface RemoteMcpDiscoveredTool {
  serverName: RemoteMcpServerName
  namespacedName: string
  originalName: string
  description: string
  inputSchema: RemoteMcpJsonSchema
  annotations?: RemoteMcpToolAnnotations
}

export interface RemoteMcpCallResult {
  content?: Array<{ type: string; text?: string }>
  [key: string]: unknown
}

export interface RemoteMcpCustomTool {
  name: string
  label: string
  description: string
  promptSnippet?: string
  parameters: unknown
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: unknown
  ) => Promise<{
    content: Array<{ type: "text"; text: string }>
    details: Record<string, unknown>
  }>
}

export interface RemoteMcpDiscoveryResult {
  tools: RemoteMcpDiscoveredTool[]
  coreTools: RemoteMcpCustomTool[]
  customTools: RemoteMcpCustomTool[]
  dispose: () => Promise<void>
}
