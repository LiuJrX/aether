import { constants } from "node:fs";
import { access as fsAccess, readFile as fsReadFile, writeFile as fsWriteFile } from "node:fs/promises";
import { resolveToCwd } from "./path-utils.js";
import type { BuiltinTool, ToolExecutionResult } from "../types.js";

export interface EditReplacement {
  oldText: string;
  newText: string;
}

export interface EditToolInput {
  path: string;
  edits: EditReplacement[];
}

export interface EditToolDetails {
  path: string;
  absolutePath: string;
  editsApplied: number;
  firstChangedLine: number;
  diff: string;
}

export interface EditOperations {
  access: (absolutePath: string) => Promise<void>;
  readFile: (absolutePath: string) => Promise<string>;
  writeFile: (absolutePath: string, content: string) => Promise<void>;
}

export interface EditToolOptions {
  operations?: EditOperations;
}

const defaultOperations: EditOperations = {
  access: (absolutePath) => fsAccess(absolutePath, constants.R_OK | constants.W_OK),
  readFile: (absolutePath) => fsReadFile(absolutePath, "utf8"),
  writeFile: (absolutePath, content) => fsWriteFile(absolutePath, content, "utf8")
};

type PlannedEdit = EditReplacement & {
  start: number;
  end: number;
};

function countMatches(source: string, needle: string): number {
  if (needle.length === 0) {
    throw new Error("Edit oldText must not be empty");
  }

  let index = 0;
  let count = 0;
  while (true) {
    const found = source.indexOf(needle, index);
    if (found === -1) {
      return count;
    }
    count += 1;
    index = found + needle.length;
  }
}

function planEdits(source: string, edits: EditReplacement[]): PlannedEdit[] {
  if (edits.length === 0) {
    throw new Error("Edit tool input is invalid. edits must contain at least one replacement.");
  }

  const planned = edits.map((edit) => {
    const matches = countMatches(source, edit.oldText);
    if (matches === 0) {
      throw new Error(`Edit oldText not found: ${JSON.stringify(edit.oldText)}`);
    }
    if (matches > 1) {
      throw new Error(`Edit oldText must be unique: ${JSON.stringify(edit.oldText)}`);
    }

    const start = source.indexOf(edit.oldText);
    return {
      ...edit,
      start,
      end: start + edit.oldText.length
    };
  });

  const sorted = [...planned].sort((a, b) => a.start - b.start);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1]!.end > sorted[index]!.start) {
      throw new Error("Edit ranges overlap. Merge nearby edits into a single replacement.");
    }
  }

  return sorted;
}

function applyEdits(source: string, edits: PlannedEdit[]): string {
  let output = source;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    output = `${output.slice(0, edit.start)}${edit.newText}${output.slice(edit.end)}`;
  }
  return output;
}

function findFirstChangedLine(before: string, after: string): number {
  const beforeLines = before.replace(/\r\n/g, "\n").split("\n");
  const afterLines = after.replace(/\r\n/g, "\n").split("\n");
  const max = Math.max(beforeLines.length, afterLines.length);
  for (let index = 0; index < max; index += 1) {
    if (beforeLines[index] !== afterLines[index]) {
      return index + 1;
    }
  }
  return 1;
}

function buildSimpleDiff(before: string, after: string): string {
  const beforeLines = before.replace(/\r\n/g, "\n").split("\n");
  const afterLines = after.replace(/\r\n/g, "\n").split("\n");
  let prefix = 0;
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1;
  }

  let beforeSuffix = beforeLines.length - 1;
  let afterSuffix = afterLines.length - 1;
  while (
    beforeSuffix >= prefix &&
    afterSuffix >= prefix &&
    beforeLines[beforeSuffix] === afterLines[afterSuffix]
  ) {
    beforeSuffix -= 1;
    afterSuffix -= 1;
  }

  const removed = beforeLines.slice(prefix, beforeSuffix + 1).map((line) => `-${line}`);
  const added = afterLines.slice(prefix, afterSuffix + 1).map((line) => `+${line}`);
  return ["--- before", "+++ after", `@@ line ${prefix + 1} @@`, ...removed, ...added].join("\n");
}

export function createEditTool(cwd: string, options?: EditToolOptions): BuiltinTool<EditToolInput, EditToolDetails> {
  const ops = options?.operations ?? defaultOperations;

  return {
    name: "edit",
    description: "对单个文件执行精确文本替换，要求 oldText 在原文件中唯一匹配。",
    async execute(input, signal): Promise<ToolExecutionResult<EditToolDetails>> {
      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      const absolutePath = resolveToCwd(input.path, cwd);
      await ops.access(absolutePath);
      const before = await ops.readFile(absolutePath);
      const planned = planEdits(before, input.edits);
      const after = applyEdits(before, planned);

      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      await ops.writeFile(absolutePath, after);

      const firstChangedLine = findFirstChangedLine(before, after);
      const diff = buildSimpleDiff(before, after);

      return {
        content: `Successfully applied ${planned.length} edit(s) to ${input.path}`,
        details: {
          path: input.path,
          absolutePath,
          editsApplied: planned.length,
          firstChangedLine,
          diff
        }
      };
    }
  };
}
