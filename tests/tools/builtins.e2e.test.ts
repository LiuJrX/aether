import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBashTool } from "../../packages/tools/src/builtins/bash.js";
import { createEditTool } from "../../packages/tools/src/builtins/edit.js";
import { createReadTool } from "../../packages/tools/src/builtins/read.js";
import { createWriteTool } from "../../packages/tools/src/builtins/write.js";

const tempDirs: string[] = [];

async function makeWorkspace() {
  const dir = await mkdtemp(join(tmpdir(), "aether-tools-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) =>
      rm(dir, { recursive: true, force: true })
    )
  );
});

describe("tools builtins e2e", () => {
  it("write + read operate on real files", async () => {
    const cwd = await makeWorkspace();
    const write = createWriteTool(cwd);
    const read = createReadTool(cwd);

    await write.execute({
      path: "notes/demo.txt",
      content: "line1\nline2\nline3"
    });

    const result = await read.execute({
      path: "notes/demo.txt",
      offset: 2,
      limit: 2
    });

    expect(result.content).toBe("line2\nline3");
  });

  it("edit updates a real file on disk", async () => {
    const cwd = await makeWorkspace();
    const write = createWriteTool(cwd);
    const edit = createEditTool(cwd);

    await write.execute({
      path: "src/demo.ts",
      content: "const value = 1;\nconsole.log(value);\n"
    });

    await edit.execute({
      path: "src/demo.ts",
      edits: [{ oldText: "const value = 1;", newText: "const value = 2;" }]
    });

    const file = await readFile(join(cwd, "src/demo.ts"), "utf8");
    expect(file).toContain("const value = 2;");
  });

  it("bash executes a real command in the workspace", async () => {
    const cwd = await makeWorkspace();
    const bash = createBashTool(cwd);

    const result = await bash.execute({
      command: "node -e \"console.log('BASH_OK')\"",
      timeout: 10
    });

    expect(result.content).toContain("BASH_OK");
    expect(result.details?.exitCode).toBe(0);
  });
});
