import type {
  AgentRuntime,
  AgentSession,
  AgentSessionOptions,
  RuntimeBackend,
} from "../../core/src/agent/index.js"

import { createAgentCoreSession } from "./backends/agent-core.js"

function resolveBackend(backend?: RuntimeBackend): RuntimeBackend {
  return backend ?? "agent-core"
}

export async function createSession(
  options: AgentSessionOptions
): Promise<AgentSession> {
  const backend = resolveBackend(options.backend)
  return createAgentCoreSession({
    ...options,
    backend,
  })
}

export function createRuntime(options?: {
  backend?: RuntimeBackend
}): AgentRuntime {
  return {
    createSession: (sessionOptions) =>
      createSession({
        ...sessionOptions,
        backend: options?.backend ?? sessionOptions.backend,
      }),
  }
}
