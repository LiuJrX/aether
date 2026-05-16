import { mkdir as fsMkdir, writeFile as fsWriteFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveToCwd } from "./path-utils.js";
import type { BuiltinTool, ToolExecutionResult } from "../types.js";

export interface WriteToolInput {
  path: string;
  content: string;
}

export interface WriteToolDetails {
  path: string;
  absolutePath: string;
  bytesWritten: number;
}

export interface WriteOperations {
  mkdir: (dir: string) => Promise<void>;
  writeFile: (absolutePath: string, content: string) => Promise<void>;
}

export interface WriteToolOptions {
  operations?: WriteOperations;
}

const defaultOperations: WriteOperations = {
  mkdir: (dir) => fsMkdir(dir, { recursive: true }).then(() => {}),
  writeFile: (absolutePath, content) => fsWriteFile(absolutePath, content, "utf8")
};

export function createWriteTool(cwd: string, options?: WriteToolOptions): BuiltinTool<WriteToolInput, WriteToolDetails> {
  const ops = options?.operations ?? defaultOperations;

  return {
    name: "write",
    description: "写入文件内容；若目录不存在会自动创建。",
    async execute(input, signal): Promise<ToolExecutionResult<WriteToolDetails>> {
      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      const absolutePath = resolveToCwd(input.path, cwd);
      await ops.mkdir(dirname(absolutePath));

      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      await ops.writeFile(absolutePath, input.content);

      return {
        content: `Successfully wrote ${Buffer.byteLength(input.content, "utf8")} bytes to ${input.path}`,
        details: {
          path: input.path,
          absolutePath,
          bytesWritten: Buffer.byteLength(input.content, "utf8")
        }
      };
    }
  };
}
