import { readAiConfig, requireAiConfig } from "../../core/src/config.js";
import type { Model, StreamOptions } from "./types.js";

export const DEFAULT_OPENAI_API = "openai-chat-completions" as const;
export const DEFAULT_OPENAI_PROVIDER = "openai" as const;

export function createOpenAIModel(input: {
  id: string;
  name?: string;
  baseUrl?: string;
  timeoutSeconds?: number;
  maxTokens?: number;
  temperature?: number;
}): Model<typeof DEFAULT_OPENAI_API> {
  // 当前项目先统一抽象成 OpenAI-compatible 模型定义，
  // 这样既能直连 OpenAI，也能接 DashScope 这类兼容网关。
  return {
    id: input.id,
    name: input.name ?? input.id,
    api: DEFAULT_OPENAI_API,
    provider: DEFAULT_OPENAI_PROVIDER,
    baseUrl: input.baseUrl,
    timeoutSeconds: input.timeoutSeconds,
    maxTokens: input.maxTokens,
    temperature: input.temperature
  };
}

export function getDefaultModel(): Model<typeof DEFAULT_OPENAI_API> {
  // 默认模型完全来自全局项目配置，而不是在 ai 包内部写死。
  const env = requireAiConfig();
  return createOpenAIModel({
    id: env.model,
    baseUrl: env.baseUrl,
    timeoutSeconds: env.timeoutSeconds
  });
}

export function resolveModel(model?: Model, options?: StreamOptions): Model {
  if (model) {
    // 调用方显式传 model 时，运行参数只做覆盖，不重新推断 provider。
    return {
      ...model,
      baseUrl: options?.baseUrl ?? model.baseUrl,
      timeoutSeconds: options?.timeoutSeconds ?? model.timeoutSeconds,
      maxTokens: options?.maxTokens ?? model.maxTokens,
      temperature: options?.temperature ?? model.temperature
    };
  }

  const env = readAiConfig();
  // 未显式传 model 时，优先读项目配置；再没有才退回一个兜底模型名，
  // 这样单测可以在不依赖真实配置时跑起来。
  return createOpenAIModel({
    id: env.model ?? "gpt-4o-mini",
    baseUrl: options?.baseUrl ?? env.baseUrl,
    timeoutSeconds: options?.timeoutSeconds ?? env.timeoutSeconds,
    maxTokens: options?.maxTokens,
    temperature: options?.temperature
  });
}
