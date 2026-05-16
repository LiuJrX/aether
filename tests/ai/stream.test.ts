import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearApiProviders, getApiProviders, registerApiProvider } from "../../packages/ai/src/api-registry.js";
import { createOpenAIModel } from "../../packages/ai/src/models.js";
import { openAIApiProvider, setOpenAIClientFactory } from "../../packages/ai/src/providers/openai.js";
import "../../packages/ai/src/providers/register-builtins.js";
import { complete, stream } from "../../packages/ai/src/stream.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetAllMocks();
});

beforeEach(() => {
  clearApiProviders();
  registerApiProvider(openAIApiProvider);
});

function resetProviderFactory() {
  setOpenAIClientFactory(({ apiKey, baseUrl, timeoutMs, headers }) => ({
    chat: {
      completions: {
        create: vi.fn(async (request: Record<string, unknown>) => ({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: "hello world",
                tool_calls: [
                  {
                    id: "call_1",
                    function: {
                      name: "lookup_weather",
                      arguments: "{\"city\":\"Hangzhou\"}"
                    }
                  }
                ]
              }
            }
          ],
          usage: {
            prompt_tokens: 11,
            completion_tokens: 7,
            total_tokens: 18
          },
          request,
          clientConfig: { apiKey, baseUrl, timeoutMs, headers }
        }))
      }
    }
  }) as never);
}

describe("registry unit", () => {
  it("registers the builtin openai provider", () => {
    expect(getApiProviders()).toHaveLength(1);
    expect(getApiProviders()[0]?.api).toBe("openai-chat-completions");
  });
});

describe("complete unit", () => {
  it("maps context and options into an openai-compatible completion call", async () => {
    resetProviderFactory();
    process.env.AETHER_LLM_API_KEY = "sk-test";
    process.env.AETHER_LLM_MODEL = "qwen-plus";
    process.env.AETHER_LLM_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode";

    const result = await complete(
      {
        messages: [
          { role: "system", content: "You are helpful." },
          { role: "user", content: "Say hi" }
        ],
        tools: [
          {
            name: "lookup_weather",
            description: "Look up the weather",
            parameters: {
              type: "object",
              properties: {
                city: { type: "string" }
              },
              required: ["city"]
            }
          }
        ]
      },
      {
        timeoutSeconds: 12,
        temperature: 0.3,
        maxTokens: 64
      }
    );

    expect(result.text).toBe("hello world");
    expect(result.finishReason).toBe("stop");
    expect(result.usage.totalTokens).toBe(18);
    expect(result.toolCalls).toEqual([
      {
        id: "call_1",
        name: "lookup_weather",
        arguments: "{\"city\":\"Hangzhou\"}"
      }
    ]);
    expect(result.raw).toMatchObject({
      clientConfig: {
        apiKey: "sk-test",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        timeoutMs: 12000
      },
      request: {
        model: "qwen-plus",
        temperature: 0.3,
        max_tokens: 64,
        stream: false
      }
    });
  });
});

describe("stream unit", () => {
  it("yields text deltas and a final result", async () => {
    setOpenAIClientFactory(() => ({
      chat: {
        completions: {
          create: vi.fn(async () => ({
            async *[Symbol.asyncIterator]() {
              yield {
                choices: [{ delta: { content: "hel" } }]
              };
              yield {
                choices: [{ delta: { content: "lo" } }]
              };
            }
          }))
        }
      }
    }) as never);

    process.env.AETHER_LLM_API_KEY = "sk-test";
    const model = createOpenAIModel({ id: "gpt-4o-mini" });
    const events = [];

    for await (const event of stream(
      {
        messages: [{ role: "user", content: "Say hello" }]
      },
      { model }
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "start", model },
      { type: "text_delta", delta: "hel" },
      { type: "text_delta", delta: "lo" },
      {
        type: "done",
        result: {
          role: "assistant",
          text: "hello",
          finishReason: null,
          usage: {
            input: 0,
            output: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, total: 0 }
          },
          toolCalls: [],
          raw: null
        }
      }
    ]);
  });
});
