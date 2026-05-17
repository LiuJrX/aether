import type {
  AssistantContent,
  AssistantMessage,
  Message,
  ModelConfig,
  Provider,
  ProviderTool,
  StreamRequest,
  ToolCallContent,
} from "./types.js"

interface OpenAIChunk {
  choices?: Array<{
    delta?: {
      content?: string
      tool_calls?: Array<{
        index: number
        id?: string
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason?: string | null
  }>
  error?: {
    message?: string
  }
}

function toOpenAIContentText(message: Message): string | null {
  switch (message.role) {
    case "user":
      return message.content.map((item) => item.text).join("\n")
    case "assistant": {
      const text = message.content
        .flatMap((item) => (item.type === "text" ? [item.text] : []))
        .join("")
      return text.length > 0 ? text : null
    }
    case "tool":
      return message.content.map((item) => item.text).join("\n")
  }
}

function toOpenAIToolCalls(message: Message): Array<{
  id: string
  type: "function"
  function: { name: string; arguments: string }
}> | undefined {
  if (message.role !== "assistant") {
    return undefined
  }

  const toolCalls = message.content.flatMap((item) => {
    if (item.type !== "toolCall") {
      return []
    }

    return [
      {
        id: item.id,
        type: "function" as const,
        function: {
          name: item.toolName,
          arguments: item.args,
        },
      },
    ]
  })

  return toolCalls.length > 0 ? toolCalls : undefined
}

function toOpenAIMessages(systemPrompt: string | undefined, messages: Message[]) {
  const openAIMessages: Array<Record<string, unknown>> = []

  if (systemPrompt && systemPrompt.trim().length > 0) {
    openAIMessages.push({
      role: "system",
      content: systemPrompt,
    })
  }

  for (const message of messages) {
    if (message.role === "tool") {
      openAIMessages.push({
        role: "tool",
        tool_call_id: message.toolCallId,
        content: toOpenAIContentText(message) ?? "",
      })
      continue
    }

    openAIMessages.push({
      role: message.role,
      content: toOpenAIContentText(message),
      tool_calls: toOpenAIToolCalls(message),
    })
  }

  return openAIMessages
}

function toOpenAITools(
  tools: ProviderTool[] | undefined
): Array<Record<string, unknown>> | undefined {
  if (!tools || tools.length === 0) {
    return undefined
  }

  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

async function readResponseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string }
    }
    if (payload.error?.message) {
      return payload.error.message
    }
  } catch {
    // ignore
  }

  return `${response.status} ${response.statusText}`.trim()
}

function parseSseLines(chunk: string, pending: string): {
  events: string[]
  pending: string
} {
  const combined = pending + chunk
  const parts = combined.split("\n\n")
  const nextPending = parts.pop() ?? ""
  return {
    events: parts,
    pending: nextPending,
  }
}

function finalizeAssistantMessage(
  textBuffer: string,
  toolCalls: Map<number, ToolCallContent>,
  finishReason: string | null
): AssistantMessage {
  const content: AssistantContent[] = []

  if (textBuffer.length > 0) {
    content.push({
      type: "text",
      text: textBuffer,
    })
  }

  const sortedToolCalls = [...toolCalls.entries()]
    .sort((a, b) => a[0] - b[0])
    .map((entry) => entry[1])
  content.push(...sortedToolCalls)

  return {
    role: "assistant",
    content,
    stopReason: finishReason === "tool_calls" ? "tool_calls" : "stop",
  }
}

export function createOpenAIProvider(): Provider {
  return {
    async stream(request: StreamRequest): Promise<AssistantMessage> {
      const url = new URL("chat/completions", request.model.baseUrl.endsWith("/")
        ? request.model.baseUrl
        : `${request.model.baseUrl}/`)

      const controller = new AbortController()
      const timeoutMs =
        request.model.timeoutSeconds !== undefined
          ? request.model.timeoutSeconds * 1000
          : undefined
      const timeoutId =
        timeoutMs !== undefined
          ? setTimeout(() => controller.abort(new Error("Request timed out")), timeoutMs)
          : undefined

      const abortSignal = request.signal
      if (abortSignal) {
        if (abortSignal.aborted) {
          controller.abort()
        } else {
          abortSignal.addEventListener("abort", () => controller.abort(), { once: true })
        }
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${request.model.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model.model,
          stream: true,
          messages: toOpenAIMessages(request.systemPrompt, request.messages),
          tools: toOpenAITools(request.tools),
          tool_choice: request.tools && request.tools.length > 0 ? "auto" : undefined,
        }),
        signal: controller.signal,
      }).finally(() => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId)
        }
      })

      if (!response.ok) {
        throw new Error(await readResponseError(response))
      }

      if (!response.body) {
        throw new Error("OpenAI response body is empty")
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let pending = ""
      let textBuffer = ""
      const toolCalls = new Map<number, ToolCallContent>()
      let finishReason: string | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }

        const chunk = decoder.decode(value, { stream: true })
        const parsed = parseSseLines(chunk, pending)
        pending = parsed.pending

        for (const rawEvent of parsed.events) {
          const dataLines = rawEvent
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice("data:".length).trim())

          for (const payload of dataLines) {
            if (payload === "[DONE]") {
              continue
            }

            const parsedChunk = JSON.parse(payload) as OpenAIChunk
            if (parsedChunk.error?.message) {
              throw new Error(parsedChunk.error.message)
            }

            const choice = parsedChunk.choices?.[0]
            if (!choice) {
              continue
            }

            if (choice.finish_reason) {
              finishReason = choice.finish_reason
            }

            const delta = choice.delta
            if (!delta) {
              continue
            }

            if (typeof delta.content === "string" && delta.content.length > 0) {
              textBuffer += delta.content
              request.onEvent?.({
                type: "text_delta",
                delta: delta.content,
              })
            }

            for (const toolCall of delta.tool_calls ?? []) {
              const existing = toolCalls.get(toolCall.index) ?? {
                type: "toolCall" as const,
                id: toolCall.id ?? "",
                toolName: toolCall.function?.name ?? "",
                args: "",
              }

              if (toolCall.id) {
                existing.id = toolCall.id
              }
              if (toolCall.function?.name) {
                existing.toolName = toolCall.function.name
              }
              if (toolCall.function?.arguments) {
                existing.args += toolCall.function.arguments
                request.onEvent?.({
                  type: "tool_call_delta",
                  index: toolCall.index,
                  id: existing.id || undefined,
                  toolName: existing.toolName || undefined,
                  argsDelta: toolCall.function.arguments,
                })
              }

              toolCalls.set(toolCall.index, existing)
            }
          }
        }
      }

      return finalizeAssistantMessage(textBuffer, toolCalls, finishReason)
    },
  }
}
