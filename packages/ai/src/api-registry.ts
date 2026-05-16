import type { Api, ApiProvider } from "./types.js";

// 运行时 provider 注册表。
// 当前只有 openai，一个 api 只保留一个最终生效的 provider。
const apiProviderRegistry = new Map<Api, ApiProvider>();

export function registerApiProvider<TApi extends Api>(provider: ApiProvider<TApi>): void {
  apiProviderRegistry.set(provider.api, provider as unknown as ApiProvider);
}

export function getApiProvider(api: Api): ApiProvider | undefined {
  return apiProviderRegistry.get(api);
}

export function getApiProviders(): ApiProvider[] {
  return Array.from(apiProviderRegistry.values());
}

export function clearApiProviders(): void {
  apiProviderRegistry.clear();
}
