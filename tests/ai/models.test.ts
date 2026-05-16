import { describe, expect, it } from "vitest";
import { createOpenAIModel, getDefaultModel, resolveModel } from "../../packages/ai/src/models.js";

describe("model helpers", () => {
  it("builds an openai-compatible model", () => {
    expect(
      createOpenAIModel({
        id: "qwen-plus",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode",
        timeoutSeconds: 30
      })
    ).toEqual({
      id: "qwen-plus",
      name: "qwen-plus",
      api: "openai-chat-completions",
      provider: "openai",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode",
      timeoutSeconds: 30,
      maxTokens: undefined,
      temperature: undefined
    });
  });

  it("resolves defaults from environment", () => {
    process.env.AETHER_LLM_API_KEY = "sk-test";
    process.env.AETHER_LLM_MODEL = "qwen-plus";
    process.env.AETHER_LLM_BASE_URL = "https://example.com";

    expect(getDefaultModel()).toMatchObject({
      id: "qwen-plus",
      provider: "openai",
      api: "openai-chat-completions",
      baseUrl: "https://example.com"
    });
  });

  it("merges runtime overrides into the selected model", () => {
    const model = createOpenAIModel({ id: "gpt-4o-mini", timeoutSeconds: 10 });

    expect(
      resolveModel(model, {
        timeoutSeconds: 45,
        maxTokens: 128,
        temperature: 0.2
      })
    ).toMatchObject({
      id: "gpt-4o-mini",
      timeoutSeconds: 45,
      maxTokens: 128,
      temperature: 0.2
    });
  });
});
