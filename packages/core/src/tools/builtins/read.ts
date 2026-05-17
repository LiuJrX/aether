import { constants } from "node:fs"
import { access as fsAccess, readFile as fsReadFile } from "node:fs/promises"
import path from "node:path"
import { Type, type Static } from "typebox"

import type { ToolDefinition } from "../types.js"

export const DEFAULT_MAX_LINES = 200
export const DEFAULT_MAX_BYTES = 16 * 1024

const readSchema = Type.Object({
  path: Type.String({
    description: "Path to the file to read (relative or absolute)",
  }),
  offset: Type.Optional(
    Type.Number({
      description: "Line number to start reading from (1-indexed)",
    })
  ),
  limit: Type.Optional(
    Type.Number({
      description: "Maximum number of lines to read",
    })
  ),
})

export type ReadToolInput = Static<typeof readSchema>

export interface ReadOperations {
  readFile: (absolutePath: string) => Promise<Buffer>
  access: (absolutePath: string) => Promise<void>
}

export interface ReadToolOptions {
  operations?: ReadOperations
  allowedRoots?: string[]
  maxLines?: number
  maxBytes?: number
}

interface TruncationResult {
  content: string
  outputLines: number
  truncated: boolean
  truncatedBy?: "lines" | "bytes"
}

const defaultReadOperations: ReadOperations = {
  readFile: (absolutePath) => fsReadFile(absolutePath),
  access: (absolutePath) => fsAccess(absolutePath, constants.R_OK),
}

function resolveTargetPath(filePath: string, baseDir: string): string {
  return path.isAbsolute(filePath)
    ? path.normalize(filePath)
    : path.resolve(baseDir, filePath)
}

function isWithinRoot(targetPath: string, root: string): boolean {
  const relativePath = path.relative(root, targetPath)
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  )
}

function ensureReadablePath(targetPath: string, allowedRoots: string[]): void {
  const normalizedRoots = allowedRoots.map((root) => path.resolve(root))
  if (normalizedRoots.some((root) => isWithinRoot(targetPath, root))) {
    return
  }

  throw new Error(`Read path is outside the allowed workspace roots: ${targetPath}`)
}

function truncateHead(
  lines: string[],
  maxLines: number,
  maxBytes: number
): TruncationResult {
  const outputLines: string[] = []
  let usedBytes = 0

  for (const line of lines.slice(0, maxLines)) {
    const candidate = outputLines.length === 0 ? line : `\n${line}`
    const candidateBytes = Buffer.byteLength(candidate, "utf-8")
    if (usedBytes + candidateBytes > maxBytes) {
      return {
        content: outputLines.join("\n"),
        outputLines: outputLines.length,
        truncated: true,
        truncatedBy: "bytes",
      }
    }

    outputLines.push(line)
    usedBytes += candidateBytes
  }

  if (lines.length > outputLines.length) {
    return {
      content: outputLines.join("\n"),
      outputLines: outputLines.length,
      truncated: true,
      truncatedBy: "lines",
    }
  }

  return {
    content: outputLines.join("\n"),
    outputLines: outputLines.length,
    truncated: false,
  }
}

export function createReadToolDefinition(
  baseDir: string,
  options?: ReadToolOptions
): ToolDefinition<typeof readSchema> {
  const operations = options?.operations ?? defaultReadOperations
  const maxLines = options?.maxLines ?? DEFAULT_MAX_LINES
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES
  const allowedRoots = options?.allowedRoots?.map((root) => path.resolve(root)) ?? [
    path.resolve(baseDir),
  ]

  return {
    name: "read",
    label: "read",
    description:
      "Read the contents of a text file. Output is truncated by line and byte limits. Use offset and limit to continue reading large files.",
    parameters: readSchema,
    async execute(_toolCallId, { path: filePath, offset, limit }, signal) {
      const absolutePath = resolveTargetPath(filePath, baseDir)
      ensureReadablePath(absolutePath, allowedRoots)

      if (signal?.aborted) {
        throw new Error("Operation aborted")
      }

      await operations.access(absolutePath)

      if (signal?.aborted) {
        throw new Error("Operation aborted")
      }

      const buffer = await operations.readFile(absolutePath)
      const allLines = buffer.toString("utf-8").split("\n")
      const startIndex = offset ? Math.max(0, offset - 1) : 0

      if (startIndex >= allLines.length) {
        throw new Error(
          `Offset ${offset} is beyond end of file (${allLines.length} lines total)`
        )
      }

      const selectedLines =
        limit !== undefined
          ? allLines.slice(startIndex, Math.min(startIndex + limit, allLines.length))
          : allLines.slice(startIndex)

      const truncated = truncateHead(selectedLines, maxLines, maxBytes)
      let outputText = truncated.content

      if (truncated.truncated) {
        const nextOffset = startIndex + truncated.outputLines + 1
        outputText += `\n\n[Use offset=${nextOffset} to continue.]`
      } else if (
        limit !== undefined &&
        startIndex + selectedLines.length < allLines.length
      ) {
        const nextOffset = startIndex + selectedLines.length + 1
        outputText += `\n\n[Use offset=${nextOffset} to continue.]`
      }

      return {
        content: [
          {
            type: "text",
            text: outputText,
          },
        ],
      }
    },
  }
}

export function createReadTool(
  baseDir: string,
  options?: ReadToolOptions
): ToolDefinition<typeof readSchema> {
  return createReadToolDefinition(baseDir, options)
}
