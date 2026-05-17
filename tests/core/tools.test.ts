import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { createReadTool, createWriteTool } from "../../packages/core/src/index.js"

test("write writes a relative path inside the provided baseDir", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aether-core-write-"))
  const baseDir = path.join(tempDir, "workspace/stages/0")
  const tool = createWriteTool(baseDir)

  await tool.execute("tool_call_1", {
    path: "report.md",
    content: "hello",
  })

  const contents = await fs.readFile(path.join(baseDir, "report.md"), "utf-8")
  assert.equal(contents, "hello")
})

test("write respects absolute paths", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aether-core-write-"))
  const baseDir = path.join(tempDir, "workspace/stages/0")
  const targetPath = path.join(tempDir, "elsewhere/output.txt")
  const tool = createWriteTool(baseDir)

  await tool.execute("tool_call_1", {
    path: targetPath,
    content: "absolute",
  })

  const contents = await fs.readFile(targetPath, "utf-8")
  assert.equal(contents, "absolute")
})

test("read reads relative files from the provided baseDir", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aether-core-read-"))
  const baseDir = path.join(tempDir, "workspace/stages/0")
  await fs.mkdir(baseDir, { recursive: true })
  await fs.writeFile(path.join(baseDir, "notes.txt"), "line 1\nline 2\nline 3")

  const tool = createReadTool(baseDir, {
    allowedRoots: [baseDir],
  })

  const result = await tool.execute("tool_call_1", {
    path: "notes.txt",
  })

  assert.equal(result.content[0]?.type, "text")
  assert.match(result.content[0]?.text ?? "", /line 1/)
  assert.match(result.content[0]?.text ?? "", /line 3/)
})

test("read supports offset and limit with continuation hints", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aether-core-read-"))
  const baseDir = path.join(tempDir, "workspace/stages/0")
  await fs.mkdir(baseDir, { recursive: true })
  await fs.writeFile(
    path.join(baseDir, "notes.txt"),
    "line 1\nline 2\nline 3\nline 4"
  )

  const tool = createReadTool(baseDir, {
    allowedRoots: [baseDir],
  })

  const result = await tool.execute("tool_call_1", {
    path: "notes.txt",
    offset: 2,
    limit: 2,
  })

  const text = result.content[0]?.text ?? ""
  assert.match(text, /^line 2\nline 3/)
  assert.match(text, /Use offset=4 to continue/)
})

test("read rejects paths outside allowed roots", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aether-core-read-"))
  const stageDir = path.join(tempDir, "workspace/stages/0")
  const sharedDir = path.join(tempDir, "workspace/shared")
  const outsidePath = path.join(tempDir, "outside.txt")
  await fs.mkdir(stageDir, { recursive: true })
  await fs.mkdir(sharedDir, { recursive: true })
  await fs.writeFile(outsidePath, "secret")

  const tool = createReadTool(stageDir, {
    allowedRoots: [stageDir, sharedDir],
  })

  await assert.rejects(
    tool.execute("tool_call_1", {
      path: outsidePath,
    }),
    /outside the allowed workspace roots/
  )
})

test("read can read from sharedDir when explicitly addressed", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aether-core-read-"))
  const stageDir = path.join(tempDir, "workspace/stages/0")
  const sharedDir = path.join(tempDir, "workspace/shared")
  const sharedFilePath = path.join(sharedDir, "shared.txt")
  await fs.mkdir(stageDir, { recursive: true })
  await fs.mkdir(sharedDir, { recursive: true })
  await fs.writeFile(sharedFilePath, "shared content")

  const tool = createReadTool(stageDir, {
    allowedRoots: [stageDir, sharedDir],
  })

  const result = await tool.execute("tool_call_1", {
    path: sharedFilePath,
  })

  assert.match(result.content[0]?.text ?? "", /shared content/)
})
