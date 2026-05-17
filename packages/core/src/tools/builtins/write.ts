import { mkdir as fsMkdir, writeFile as fsWriteFile } from "node:fs/promises"
import path from "node:path"
import { Type, type Static } from "typebox"

import type { ToolDefinition } from "../types.js"

const writeSchema = Type.Object({
  path: Type.String({
    description: "Path to the file to write (relative or absolute)",
  }),
  content: Type.String({
    description: "Content to write to the file",
  }),
})

export type WriteToolInput = Static<typeof writeSchema>

export interface WriteOperations {
  writeFile: (absolutePath: string, content: string) => Promise<void>
  mkdir: (dir: string) => Promise<void>
}

export interface WriteToolOptions {
  operations?: WriteOperations
}

const defaultWriteOperations: WriteOperations = {
  writeFile: (absolutePath, content) => fsWriteFile(absolutePath, content, "utf-8"),
  mkdir: (dir) => fsMkdir(dir, { recursive: true }).then(() => undefined),
}

function resolveTargetPath(filePath: string, baseDir: string): string {
  return path.isAbsolute(filePath)
    ? path.normalize(filePath)
    : path.resolve(baseDir, filePath)
}

export function createWriteToolDefinition(
  baseDir: string,
  options?: WriteToolOptions
): ToolDefinition<typeof writeSchema> {
  const operations = options?.operations ?? defaultWriteOperations

  return {
    name: "write",
    label: "write",
    description:
      "Write content to a file. Creates the file if it does not exist, overwrites if it does. Automatically creates parent directories.",
    parameters: writeSchema,
    async execute(_toolCallId, { path: filePath, content }, signal) {
      const absolutePath = resolveTargetPath(filePath, baseDir)
      const dir = path.dirname(absolutePath)

      if (signal?.aborted) {
        throw new Error("Operation aborted")
      }

      await operations.mkdir(dir)

      if (signal?.aborted) {
        throw new Error("Operation aborted")
      }

      await operations.writeFile(absolutePath, content)

      return {
        content: [
          {
            type: "text",
            text: `Successfully wrote ${content.length} bytes to ${filePath}`,
          },
        ],
      }
    },
  }
}

export function createWriteTool(
  baseDir: string,
  options?: WriteToolOptions
): ToolDefinition<typeof writeSchema> {
  return createWriteToolDefinition(baseDir, options)
}
