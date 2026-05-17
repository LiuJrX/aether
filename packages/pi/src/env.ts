import fs from "node:fs/promises"
import path from "node:path"

import { config as loadDotenv } from "dotenv"

export interface AetherModelConfig {
  apiKey: string
  baseUrl: string
  model: string
  timeoutSeconds?: number
}

function normalizeOpenAICompatibleBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl)
    const normalizedPath = url.pathname.replace(/\/+$/, "")

    if (!normalizedPath.endsWith("/v1")) {
      url.pathname = `${normalizedPath}/v1`
    }

    return url.toString().replace(/\/$/, "")
  } catch {
    return baseUrl.replace(/\/+$/, "")
  }
}

export async function loadProjectEnv(cwd: string): Promise<void> {
  const envPath = path.resolve(cwd, ".env")

  try {
    await fs.access(envPath)
    loadDotenv({
      path: envPath,
      override: false,
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error
    }
  }
}

export function getAetherModelConfig(): AetherModelConfig | undefined {
  const apiKey = process.env.AETHER_LLM_API_KEY?.trim()
  const baseUrl = process.env.AETHER_LLM_BASE_URL?.trim()
  const model = process.env.AETHER_LLM_MODEL?.trim()
  const timeoutRaw = process.env.AETHER_LLM_TIMEOUT_SECONDS?.trim()

  if (!apiKey || !baseUrl || !model) {
    return undefined
  }

  const timeoutSeconds =
    timeoutRaw && Number.isFinite(Number(timeoutRaw))
      ? Number(timeoutRaw)
      : undefined

  return {
    apiKey,
    baseUrl: normalizeOpenAICompatibleBaseUrl(baseUrl),
    model,
    timeoutSeconds,
  }
}
