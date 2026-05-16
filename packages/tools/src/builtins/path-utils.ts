import { isAbsolute, normalize, resolve } from "node:path";

export function resolveToCwd(filePath: string, cwd: string): string {
  return normalize(isAbsolute(filePath) ? filePath : resolve(cwd, filePath));
}
