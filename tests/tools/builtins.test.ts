import { describe, expect, it, vi } from "vitest";
import { createBashTool } from "../../packages/tools/src/builtins/bash.js";
import { createEditTool } from "../../packages/tools/src/builtins/edit.js";
import { createReadTool } from "../../packages/tools/src/builtins/read.js";
import { createWriteTool } from "../../packages/tools/src/builtins/write.js";

describe("tools builtins unit", () => {
  it("read uses injected operations and slices by line range", async () => {
    const tool = createReadTool("/workspace", {
      operations: {
        access: vi.fn(async () => {}),
        readFile: vi.fn(async () => "a\nb\nc\nd")
      }
    });

    const result = await tool.execute({ path: "demo.txt", offset: 2, limit: 2 });

    expect(result.content).toBe("b\nc");
    expect(result.details).toMatchObject({
      path: "demo.txt",
      startLine: 2,
      endLine: 3,
      totalLines: 4,
      truncated: true
    });
  });

  it("write uses injected operations and reports bytes", async () => {
    const mkdir = vi.fn(async () => {});
    const writeFile = vi.fn(async () => {});
    const tool = createWriteTool("/workspace", {
      operations: { mkdir, writeFile }
    });

    const result = await tool.execute({ path: "nested/file.txt", content: "hello" });

    expect(mkdir).toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalled();
    expect(result.details?.bytesWritten).toBe(5);
  });

  it("edit applies multiple unique replacements against original content", async () => {
    let current = "const a = 1;\nconst b = 2;\n";
    const tool = createEditTool("/workspace", {
      operations: {
        access: vi.fn(async () => {}),
        readFile: vi.fn(async () => current),
        writeFile: vi.fn(async (_path, content) => {
          current = content;
        })
      }
    });

    const result = await tool.execute({
      path: "demo.ts",
      edits: [
        { oldText: "const a = 1;", newText: "const a = 10;" },
        { oldText: "const b = 2;", newText: "const b = 20;" }
      ]
    });

    expect(current).toBe("const a = 10;\nconst b = 20;\n");
    expect(result.details?.editsApplied).toBe(2);
    expect(result.details?.diff).toContain("const a = 1;");
  });

  it("edit rejects non-unique replacements", async () => {
    const tool = createEditTool("/workspace", {
      operations: {
        access: vi.fn(async () => {}),
        readFile: vi.fn(async () => "value\nvalue\n"),
        writeFile: vi.fn(async () => {})
      }
    });

    await expect(
      tool.execute({
        path: "dup.txt",
        edits: [{ oldText: "value", newText: "next" }]
      })
    ).rejects.toThrow("must be unique");
  });

  it("bash returns combined stdout and stderr from injected operations", async () => {
    const tool = createBashTool("/workspace", {
      operations: {
        exec: vi.fn(async () => ({
          exitCode: 0,
          stdout: "stdout",
          stderr: "stderr",
          timedOut: false
        }))
      }
    });

    const result = await tool.execute({ command: "echo test" });

    expect(result.content).toBe("stdout\nstderr");
    expect(result.details).toMatchObject({ exitCode: 0, timedOut: false });
  });
});
