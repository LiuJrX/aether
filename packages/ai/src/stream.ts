import "./providers/register-builtins.js";

import { getApiProvider } from "./api-registry.js";
import { resolveModel } from "./models.js";
import type { CompletionResult, Context, Model, ProviderStreamOptions, StreamEvent } from "./types.js";

function requireProvider(model: Model) {
  const provider = getApiProvider(model.api);

  if (!provider) {
    throw new Error(`No API provider registered for api: ${model.api}`);
  }

  return provider;
}

export function stream(context: Context, options?: ProviderStreamOptions): AsyncIterable<StreamEvent> {
  // 对上层暴露统一入口：先解析 model，再分发到对应 provider。
  const model = resolveModel(options?.model, options);
  return requireProvider(model).stream(model, context, options);
}

export function complete(context: Context, options?: ProviderStreamOptions): Promise<CompletionResult> {
  // 非流式入口和流式入口共享同一套 model / provider 选择逻辑。
  const model = resolveModel(options?.model, options);
  return requireProvider(model).complete(model, context, options);
}
