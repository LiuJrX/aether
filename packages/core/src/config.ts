export interface AiConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutSeconds?: number;
}

const CONFIG_KEYS = {
  apiKey: "AETHER_LLM_API_KEY",
  baseUrl: "AETHER_LLM_BASE_URL",
  model: "AETHER_LLM_MODEL",
  timeoutSeconds: "AETHER_LLM_TIMEOUT_SECONDS"
} as const;

export function readAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const timeoutRaw = env[CONFIG_KEYS.timeoutSeconds];
  const timeoutSeconds = timeoutRaw === undefined ? undefined : Number(timeoutRaw);

  if (timeoutRaw !== undefined && Number.isNaN(timeoutSeconds)) {
    throw new Error(`${CONFIG_KEYS.timeoutSeconds} must be a valid number`);
  }

  return {
    apiKey: env[CONFIG_KEYS.apiKey],
    baseUrl: env[CONFIG_KEYS.baseUrl],
    model: env[CONFIG_KEYS.model],
    timeoutSeconds
  };
}

export function requireAiConfig(
  env: NodeJS.ProcessEnv = process.env
): Required<Pick<AiConfig, "apiKey" | "model">> & AiConfig {
  const config = readAiConfig(env);

  if (!config.apiKey) {
    throw new Error(`${CONFIG_KEYS.apiKey} is required`);
  }

  if (!config.model) {
    throw new Error(`${CONFIG_KEYS.model} is required`);
  }

  return config as Required<Pick<AiConfig, "apiKey" | "model">> & AiConfig;
}
