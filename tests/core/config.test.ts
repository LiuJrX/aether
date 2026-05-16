import { afterEach, describe, expect, it } from "vitest";
import { readAiConfig, requireAiConfig } from "../../packages/core/src/config.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("global ai config", () => {
  it("reads configured values", () => {
    process.env.AETHER_LLM_API_KEY = "sk-test";
    process.env.AETHER_LLM_BASE_URL = "https://example.com/v1";
    process.env.AETHER_LLM_MODEL = "qwen-plus";
    process.env.AETHER_LLM_TIMEOUT_SECONDS = "30";

    expect(readAiConfig()).toEqual({
      apiKey: "sk-test",
      baseUrl: "https://example.com/v1",
      model: "qwen-plus",
      timeoutSeconds: 30
    });
  });

  it("throws when timeout is invalid", () => {
    process.env.AETHER_LLM_TIMEOUT_SECONDS = "abc";

    expect(() => readAiConfig()).toThrow("AETHER_LLM_TIMEOUT_SECONDS must be a valid number");
  });

  it("requires api key and model", () => {
    delete process.env.AETHER_LLM_API_KEY;
    delete process.env.AETHER_LLM_MODEL;

    expect(() => requireAiConfig()).toThrow("AETHER_LLM_API_KEY is required");

    process.env.AETHER_LLM_API_KEY = "sk-test";
    expect(() => requireAiConfig()).toThrow("AETHER_LLM_MODEL is required");
  });
});
