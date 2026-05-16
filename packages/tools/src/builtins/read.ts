import { constants } from "node:fs";
import { access as fsAccess, readFile as fsReadFile } from "node:fs/promises";
import { resolveToCwd } from "./path-utils.js";
import type { BuiltinTool, ToolExecutionResult } from "../types.js";

export interface ReadToolInput {
  path: string;
  offset?: number;
  limit?: number;
}

export interface ReadToolDetails {
  path: string;
  absolutePath: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  truncated: boolean;
}

export interface ReadOperations {
  access: (absolutePath: string) => Promise<void>;
  readFile: (absolutePath: string) => Promise<string>;
}

export interface ReadToolOptions {
  operations?: ReadOperations;
}

const defaultOperations: ReadOperations = {
  access: (absolutePath) => fsAccess(absolutePath, constants.R_OK),
  readFile: (absolutePath) => fsReadFile(absolutePath, "utf8")
};

function normalizeReadRange(input: ReadToolInput) {
  const startLine = input.offset === undefined ? 1 : Math.max(1, Math.floor(input.offset));
  const limit = input.limit === undefined ? undefined : Math.max(1, Math.floor(input.limit));
  return { startLine, limit };
}

function buildReadResult(
  absolutePath: string,
  path: string,
  source: string,
  input: ReadToolInput
): ToolExecutionResult<ReadToolDetails> {
  const normalized = source.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const { startLine, limit } = normalizeReadRange(input);
  const startIndex = startLine - 1;
  const selected = limit === undefined ? lines.slice(startIndex) : lines.slice(startIndex, startIndex + limit);
  const endLine = selected.length === 0 ? startLine - 1 : startLine + selected.length - 1;

  return {
    content: selected.join("\n"),
    details: {
      path,
      absolutePath,
      startLine,
      endLine,
      totalLines: lines.length,
      truncated: limit !== undefined && startIndex + selected.length < lines.length
    }
  };
}

export function createReadTool(cwd: string, options?: ReadToolOptions): BuiltinTool<ReadToolInput, ReadToolDetails> {
  const ops = options?.operations ?? defaultOperations;

  return {
    name: "read",
    description: "读取文件内容，可选按行分页读取。",
    async execute(input, signal) {
      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      const absolutePath = resolveToCwd(input.path, cwd);
      await ops.access(absolutePath);

      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      const content = await ops.readFile(absolutePath);
      return buildReadResult(absolutePath, input.path, content, input);
    }
  };
}
