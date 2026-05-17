import fs from "node:fs/promises"
import path from "node:path"

import { config as loadDotenv } from "dotenv"
import { createOpenAIProvider } from "./openai.js"
import type { ModelConfig, ModelContext, ProviderConfig } from "./types.js"

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

export function getModelConfig(): ModelConfig | undefined {
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

export function getProviderConfig(): ProviderConfig | undefined {
  const config = getModelConfig()
  if (!config) {
    return undefined
  }

  return {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    timeoutMs:
      config.timeoutSeconds !== undefined
        ? config.timeoutSeconds * 1000
        : undefined,
  }
}

export async function createModelContext(options?: {
  cwd?: string
  timeoutSeconds?: number
}): Promise<ModelContext | undefined> {
  const cwd = options?.cwd ?? process.cwd()
  await loadProjectEnv(cwd)

  const modelConfig = getModelConfig()
  if (!modelConfig) {
    return undefined
  }

  const timeoutSeconds = options?.timeoutSeconds ?? modelConfig.timeoutSeconds
  const resolvedModelConfig: ModelConfig = {
    ...modelConfig,
    timeoutSeconds,
  }

  const providerConfig: ProviderConfig = {
    apiKey: resolvedModelConfig.apiKey,
    baseUrl: resolvedModelConfig.baseUrl,
    timeoutMs:
      timeoutSeconds !== undefined ? timeoutSeconds * 1000 : undefined,
  }

  return {
    modelConfig: resolvedModelConfig,
    providerConfig,
    provider: createOpenAIProvider(),
  }
}

export function createOpenAICompatibleModel(config: ModelConfig): ModelConfig {
  return { ...config }
}
