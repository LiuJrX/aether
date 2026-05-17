import type { Message } from "../ai/index.js"
import type { ToolContext } from "../tools/types.js"
import { runAgentLoop } from "./agent-loop.js"
import type { AgentEvent, AgentSession, AgentState, AgentTool } from "./types.js"

export class Agent {
  private readonly listeners = new Set<(event: AgentEvent) => void>()
  private abortController = new AbortController()

  readonly state: AgentState

  constructor(options: {
    initialState: {
      model: AgentState["model"]
      systemPrompt: string
      tools: AgentTool[]
      messages?: Message[]
      toolContext?: ToolContext
    }
  }) {
    this.state = {
      model: options.initialState.model,
      systemPrompt: options.initialState.systemPrompt,
      tools: options.initialState.tools.slice(),
      messages: options.initialState.messages?.slice() ?? [],
      toolContext: options.initialState.toolContext ?? {
        cwd: process.cwd(),
      },
    }
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  setTools(tools: AgentTool[]): void {
    this.state.tools = tools.slice()
  }

  setToolContext(context: Partial<ToolContext>): void {
    this.state.toolContext = {
      ...this.state.toolContext,
      ...context,
    }
  }

  async prompt(text: string): Promise<void> {
    this.state.messages = [
      ...this.state.messages,
      {
        role: "user",
        content: [{ type: "text", text }],
      },
    ]

    await runAgentLoop({
      state: this.state,
      signal: this.abortController.signal,
      emit: (event) => this.emit(event),
    })
  }

  abort(): void {
    this.abortController.abort()
  }

  reset(): void {
    this.abortController.abort()
    this.abortController = new AbortController()
    this.state.messages = []
  }

  toSession(allTools: AgentTool[], activeTools?: AgentTool[]): AgentSession {
    let currentActiveTools = activeTools?.slice() ?? allTools.slice()
    this.setTools(currentActiveTools)
    const agent = this

    return {
      prompt: async (text) => agent.prompt(text),
      getActiveToolNames: () => currentActiveTools.map((tool) => tool.name),
      getAllTools: () => allTools.map((tool) => ({ name: tool.name })),
      setActiveToolsByName: (toolNames) => {
        const allowed = new Set(toolNames)
        currentActiveTools = allTools.filter((tool) =>
          allowed.has(tool.name)
        )
        agent.setTools(currentActiveTools)
      },
      setToolContext: (context) => agent.setToolContext(context),
      subscribe: (listener) => agent.subscribe(listener),
      dispose: () => agent.reset(),
      state: Object.defineProperty({}, "messages", {
        enumerable: true,
        get() {
          return [...agent.state.messages]
        },
      }) as AgentSession["state"],
    }
  }
}
