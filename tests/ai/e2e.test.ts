import { describe, expect, it } from "vitest";
import { complete, stream } from "../../packages/ai/src/stream.js";

const hasRealAiConfig = Boolean(
  process.env.AETHER_LLM_API_KEY &&
  process.env.AETHER_LLM_BASE_URL &&
  process.env.AETHER_LLM_MODEL
);

describe.skipIf(!hasRealAiConfig)("ai e2e", () => {
  it(
    "sends a real completion request",
    { timeout: 60000 },
    async () => {
      const result = await complete({
        messages: [
          {
            role: "system",
            content: "You are a precise test assistant. Keep answers short."
          },
          {
            role: "user",
            content: "Reply with exactly: REAL_OK"
          }
        ]
      });
      console.log(result);
      expect(result.role).toBe("assistant");
      expect(result.text).toContain("REAL_OK");
      expect(result.usage.totalTokens).toBeGreaterThan(0);
    }
  );

  it(
    "streams a real completion request",
    { timeout: 60000 },
    async () => {
      const deltas: string[] = [];
      let finalText = "";

      for await (const event of stream({
        messages: [
          {
            role: "system",
            content: "You are a precise test assistant. Keep answers short."
          },
          {
            role: "user",
            content: "Reply with exactly: STREAM_OK"
          }
        ]
      })) {
        if (event.type === "text_delta") {
          deltas.push(event.delta);
        }

        if (event.type === "done") {
          finalText = event.result.text;
        }
      }

      const streamedText = deltas.join("");

      expect(streamedText.length).toBeGreaterThan(0);
      expect(finalText).toContain("STREAM_OK");
    }
  );
});
