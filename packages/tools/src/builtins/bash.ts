import { spawn } from "node:child_process";
import { resolveToCwd } from "./path-utils.js";
import type { BuiltinTool, ToolExecutionResult } from "../types.js";

export interface BashToolInput {
  command: string;
  timeout?: number;
}

export interface BashToolDetails {
  command: string;
  cwd: string;
  exitCode: number | null;
  timedOut: boolean;
}

export interface BashOperations {
  exec: (
    command: string,
    cwd: string,
    options: {
      signal?: AbortSignal;
      timeout?: number;
    }
  ) => Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }>;
}

export interface BashToolOptions {
  operations?: BashOperations;
  shell?: string;
}

function createLocalBashOperations(shell = process.env.SHELL || "/bin/bash"): BashOperations {
  return {
    exec(command, cwd, options) {
      return new Promise((resolve, reject) => {
        const child = spawn(shell, ["-lc", command], {
          cwd,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"]
        });

        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let timeoutHandle: NodeJS.Timeout | undefined;

        child.stdout?.on("data", (chunk) => {
          stdout += chunk.toString();
        });
        child.stderr?.on("data", (chunk) => {
          stderr += chunk.toString();
        });

        const abort = () => {
          child.kill("SIGTERM");
          reject(new Error("Operation aborted"));
        };

        if (options.signal) {
          if (options.signal.aborted) {
            abort();
            return;
          }
          options.signal.addEventListener("abort", abort, { once: true });
        }

        if (options.timeout !== undefined && options.timeout > 0) {
          timeoutHandle = setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
          }, options.timeout * 1000);
        }

        child.on("error", (error) => {
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
          options.signal?.removeEventListener("abort", abort);
          reject(error);
        });

        child.on("close", (exitCode) => {
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
          options.signal?.removeEventListener("abort", abort);

          if (timedOut) {
            resolve({ exitCode, stdout, stderr, timedOut: true });
            return;
          }

          resolve({ exitCode, stdout, stderr, timedOut: false });
        });
      });
    }
  };
}

export function createBashTool(cwd: string, options?: BashToolOptions): BuiltinTool<BashToolInput, BashToolDetails> {
  const ops = options?.operations ?? createLocalBashOperations(options?.shell);

  return {
    name: "bash",
    description: "在当前工作目录执行 shell 命令，返回 stdout 与 stderr。",
    async execute(input, signal): Promise<ToolExecutionResult<BashToolDetails>> {
      const workingDirectory = resolveToCwd(".", cwd);
      const result = await ops.exec(input.command, workingDirectory, {
        signal,
        timeout: input.timeout
      });

      const output = [result.stdout.trimEnd(), result.stderr.trimEnd()].filter(Boolean).join("\n");
      return {
        content: output,
        details: {
          command: input.command,
          cwd: workingDirectory,
          exitCode: result.exitCode,
          timedOut: result.timedOut
        }
      };
    }
  };
}
