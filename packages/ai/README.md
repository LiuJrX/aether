库的核心是一个统一多 Provider 的 LLM 流式 API，OpenAI provider 并非简单的 SDK 封装，而是实现了一套完整的事件流协议。

```
Provider 体系
├── Model 元数据（能力、成本、限制）
├── StreamFunction（核心：将 API 响应转为统一事件流）
├── AssistantMessageEventStream（事件总线）
└── Context → Provider API → 事件流 → AssistantMessage
```

# OpenAI
OpenAI 有两套 API需要分别实现：
- `openai-completions` — Chat Completions（/v1/chat/completions）
- `openai-responses` — Responses API（/v1/responses，更新的 API）