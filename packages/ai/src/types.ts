export type KnownProvider = "openai";
export type Provider = KnownProvider | (string & {});

export type KnownApi = 
  | "openai-completions" 
  | "openai-chat-completions" 
  | "openai-responses";

export type Api = KnownApi | (string & {});

// Usage / CompletionResult / StreamEvent 是 ai 模块对外的统一协议，
// 上层尽量不要直接依赖某个 provider SDK 的原始类型。
export interface UsageCost {
  input: number;
  output: number;
  total: number;
}

export interface Usage {
  input: number;
  output: number;
  totalTokens: number;
  cost: UsageCost;
}

export interface Model<TApi extends Api = Api> {
  // Model 只描述“调用哪个模型以及默认参数”，
  // 不负责真正发请求，请求由 provider 实现处理。
  id: string;
  name: string;
  api: TApi;
  provider: Provider;
  baseUrl?: string;
  timeoutSeconds?: number;
  maxTokens?: number;
  temperature?: number;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
}

export interface Context {
  // Context 是本模块对会话输入的统一抽象。
  messages: ChatMessage[];
  tools?: ToolDefinition[];
}

export interface StreamOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutSeconds?: number;
  temperature?: number;
  maxTokens?: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface ProviderStreamOptions extends StreamOptions {
  model?: Model;
}

export interface CompletionResult {
  role: "assistant";
  text: string;
  finishReason: string | null;
  usage: Usage;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  raw: unknown;
}

export type StreamEvent =
  | { type: "start"; model: Model }
  | { type: "text_delta"; delta: string }
  | { type: "tool_call"; toolCall: { id: string; name: string; arguments: string } }
  | { type: "done"; result: CompletionResult }
  | { type: "error"; error: Error };

export interface ApiProvider<TApi extends Api = Api> {
  // 每种底层 API 只需要实现 complete / stream 两个能力，
  // 就可以挂到统一入口里被调用。
  api: TApi;
  complete: (model: Model<TApi>, context: Context, options?: StreamOptions) => Promise<CompletionResult>;
  stream: (model: Model<TApi>, context: Context, options?: StreamOptions) => AsyncIterable<StreamEvent>;
}
