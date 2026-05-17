import type { AgentSession } from "../../../core/src/agent/index.js"

export const TOOL_RESULT_PREVIEW_LIMIT = 700

export function truncatePreview(text: string): string | undefined {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (normalized.length === 0) {
    return undefined
  }

  if (normalized.length <= TOOL_RESULT_PREVIEW_LIMIT) {
    return normalized
  }

  return `${normalized.slice(0, TOOL_RESULT_PREVIEW_LIMIT - 3)}...`
}

export function extractToolResultPreview(result: unknown): string | undefined {
  if (typeof result === "string") {
    return truncatePreview(result)
  }

  if (typeof result !== "object" || result === null) {
    return undefined
  }

  const content = "content" in result ? result.content : undefined
  if (!Array.isArray(content)) {
    return undefined
  }

  const preview = content
    .flatMap((item) => {
      if (typeof item !== "object" || item === null) {
        return []
      }

      const itemType = "type" in item ? item.type : undefined
      if (itemType !== "text") {
        return []
      }

      const text = "text" in item ? item.text : undefined
      return typeof text === "string" ? [text] : []
    })
    .join(" ")

  return truncatePreview(preview)
}

export function extractAssistantText(message: unknown): string {
  if (typeof message !== "object" || message === null || !("content" in message)) {
    return ""
  }

  const content = message.content
  if (!Array.isArray(content)) {
    return ""
  }

  return content
    .flatMap((item) => {
      if (typeof item !== "object" || item === null) {
        return []
      }

      const itemType = "type" in item ? item.type : undefined
      if (itemType !== "text") {
        return []
      }

      const text = "text" in item ? item.text : undefined
      return typeof text === "string" ? [text] : []
    })
    .join("")
    .trim()
}

export function stringifyArgsPreview(args: unknown): string {
  return truncatePreview(JSON.stringify(args ?? {}, null, 2)) ?? ""
}
