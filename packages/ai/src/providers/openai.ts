import OpenAI from "openai";
import type { ChatCompletionChunk } from "openai/resources/chat/completions/completions";
import { readAiConfig } from "../../../core/src/config.js";
import type {
  ApiProvider,
  CompletionResult,
  Context,
  Model,
  StreamEvent,
  StreamOptions
} from "../types.js";

type OpenAIClientLike = Pick<OpenAI, "chat">;

type OpenAIClientFactory = (input: {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}) => OpenAIClientLike;

// 通过可替换的 client factory，把真实请求和测试 mock 解耦。
let openAIClientFactory: OpenAIClientFactory = ({ apiKey, baseUrl, timeoutMs, headers }) =>
  new OpenAI({
    apiKey,
    baseURL: baseUrl,
    timeout: timeoutMs,
    defaultHeaders: headers
  });

export function setOpenAIClientFactory(factory: OpenAIClientFactory): void {
  openAIClientFactory = factory;
}

function normalizeBaseUrl(baseUrl?: string): string | undefined {
  if (!baseUrl) {
    return baseUrl;
  }

  const trimmed = baseUrl.replace(/\/+$/u, "");

  // DashScope 的 OpenAI 兼容地址在文档里常见两种写法，
  // 这里统一兜底补成 SDK 可直接请求的 /v1 形式。
  if (trimmed.endsWith("/compatible-mode")) {
    return `${trimmed}/v1`;
  }

  return trimmed;
}

function createClient(model: Model<"openai-chat-completions">, options?: StreamOptions): OpenAIClientLike {
  const apiKey = options?.apiKey ?? readAiConfig().apiKey;

  if (!apiKey) {
    throw new Error("AETHER_LLM_API_KEY is required");
  }

  const timeoutMs = (options?.timeoutSeconds ?? model.timeoutSeconds) === undefined
    ? undefined
    : (options?.timeoutSeconds ?? model.timeoutSeconds)! * 1000;

  return openAIClientFactory({
    apiKey,
    baseUrl: normalizeBaseUrl(options?.baseUrl ?? model.baseUrl),
    timeoutMs,
    headers: options?.headers
  });
}

function buildMessages(context: Context) {
  // 统一把内部 Context 转成 OpenAI SDK 期望的 message 结构。
  return context.messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool" as const,
        content: message.content,
        tool_call_id: message.toolCallId ?? ""
      };
    }

    return {
      role: message.role,
      content: message.content
    };
  });
}

function buildTools(context: Context) {
  // 当前工具定义直接映射为 OpenAI function calling 结构。
  return context.tools?.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters ?? { type: "object", properties: {} }
    }
  }));
}

function buildUsage(rawUsage?: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}) {
  // 先对齐统一 usage 结构，成本字段后续接入价格表后再补实际计算。
  const input = rawUsage?.prompt_tokens ?? 0;
  const output = rawUsage?.completion_tokens ?? 0;
  const totalTokens = rawUsage?.total_tokens ?? input + output;

  return {
    input,
    output,
    totalTokens,
    cost: {
      input: 0,
      output: 0,
      total: 0
    }
  };
}

function buildResult(raw: {
  choices: Array<{
    finish_reason: string | null;
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}): CompletionResult {
  const choice = raw.choices[0];
  const message = choice?.message;

  // provider 原始结果在 raw 中保留，方便上层排障和后续扩展。
  return {
    role: "assistant",
    text: message?.content ?? "",
    finishReason: choice?.finish_reason ?? null,
    usage: buildUsage(raw.usage),
    toolCalls: (message?.tool_calls ?? []).map((toolCall) => ({
      id: toolCall.id ?? "",
      name: toolCall.function?.name ?? "",
      arguments: toolCall.function?.arguments ?? ""
    })),
    raw
  };
}

async function* streamOpenAIInternal(
  model: Model<"openai-chat-completions">,
  context: Context,
  options?: StreamOptions
): AsyncIterable<StreamEvent> {
  const client = createClient(model, options);
  const stream = await client.chat.completions.create({
    model: model.id,
    messages: buildMessages(context),
    tools: buildTools(context),
    temperature: options?.temperature ?? model.temperature,
    max_tokens: options?.maxTokens ?? model.maxTokens,
    stream: true
  });

  const textParts: string[] = [];
  const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();

  yield { type: "start", model };

  for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
    const delta = chunk.choices[0]?.delta;
    const content = delta?.content ?? "";

    if (content) {
      textParts.push(content);
      yield { type: "text_delta", delta: content };
    }

    // 流式 tool call 参数会被分片返回，这里按 index 聚合成完整调用。
    for (const partialToolCall of delta?.tool_calls ?? []) {
      const index = partialToolCall.index ?? 0;
      const existing = toolCalls.get(index) ?? {
        id: partialToolCall.id ?? "",
        name: partialToolCall.function?.name ?? "",
        arguments: ""
      };

      if (partialToolCall.id) {
        existing.id = partialToolCall.id;
      }

      if (partialToolCall.function?.name) {
        existing.name = partialToolCall.function.name;
      }

      if (partialToolCall.function?.arguments) {
        existing.arguments += partialToolCall.function.arguments;
      }

      toolCalls.set(index, existing);
    }
  }

  for (const toolCall of toolCalls.values()) {
    yield { type: "tool_call", toolCall };
  }

  // 流式接口最后也产出一份聚合后的完成结果，便于上层统一处理。
  yield {
    type: "done",
    result: {
      role: "assistant",
      text: textParts.join(""),
      finishReason: null,
      usage: buildUsage(),
      toolCalls: Array.from(toolCalls.values()),
      raw: null
    }
  };
}

async function completeOpenAI(
  model: Model<"openai-chat-completions">,
  context: Context,
  options?: StreamOptions
): Promise<CompletionResult> {
  // 非流式调用直接走一次完整请求，返回统一结果结构。
  const client = createClient(model, options);
  const response = await client.chat.completions.create({
    model: model.id,
    messages: buildMessages(context),
    tools: buildTools(context),
    temperature: options?.temperature ?? model.temperature,
    max_tokens: options?.maxTokens ?? model.maxTokens,
    stream: false
  });

  return buildResult(response);
}

export const openAIApiProvider: ApiProvider<"openai-chat-completions"> = {
  api: "openai-chat-completions",
  complete: completeOpenAI,
  stream: streamOpenAIInternal
};
