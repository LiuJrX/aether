> 模型供应商适配：OpenAI、Anthropic、Ollama 等(暂时支持 openai )

# AI 模块

`packages/ai` 提供项目内统一的 LLM 调用抽象。

当前只实现了一个 `openai-compatible` provider，但设计上已经拆成了 `model`、`provider`、`registry`、`stream/complete` 几层，后面可以继续接入更多 provider，而不需要改上层调用方式。

## 配置

AI 模块不自己维护独立配置，而是读取项目全局配置 [packages/core/src/config.ts](/Users/alisa/Documents/Program/Project/aether/packages/core/src/config.ts) 中定义的这些环境变量：

```env
AETHER_LLM_API_KEY="your-api-key"
AETHER_LLM_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
AETHER_LLM_MODEL="qwen-plus"
AETHER_LLM_TIMEOUT_SECONDS="30"
```

说明：

- `AETHER_LLM_API_KEY`：调用模型的密钥
- `AETHER_LLM_BASE_URL`：OpenAI-compatible 网关地址
- `AETHER_LLM_MODEL`：默认模型名
- `AETHER_LLM_TIMEOUT_SECONDS`：默认超时秒数

如果使用 DashScope，`base_url` 建议直接写成 `.../compatible-mode/v1`。当前代码也兼容 `.../compatible-mode`，内部会自动补 `/v1`。

## 模块结构

### 1. 类型层

文件：

- [packages/ai/src/types.ts](/Users/alisa/Documents/Program/Project/aether/packages/ai/src/types.ts)

职责：

- 定义统一的 `Model`
- 定义统一的 `Context`
- 定义统一的 `CompletionResult`
- 定义流式事件 `StreamEvent`
- 定义 provider 接口 `ApiProvider`

这一层的目标是把“上层业务协议”和“底层 SDK 协议”分开。上层只依赖这里的类型，不直接依赖 OpenAI SDK 的返回结构。

### 2. Model 解析层

文件：

- [packages/ai/src/models.ts](/Users/alisa/Documents/Program/Project/aether/packages/ai/src/models.ts)

职责：

- 构造 OpenAI-compatible 模型定义
- 从全局配置中读取默认模型
- 在运行时把调用参数覆盖到 model 上

逻辑：

1. 如果调用方显式传了 `model`，优先使用它
2. 如果没传，则从全局 `AETHER_LLM_*` 配置中推导
3. `temperature`、`maxTokens`、`timeoutSeconds` 这类运行参数可以在调用时覆盖

### 3. Provider 注册层

文件：

- [packages/ai/src/api-registry.ts](/Users/alisa/Documents/Program/Project/aether/packages/ai/src/api-registry.ts)
- [packages/ai/src/providers/register-builtins.ts](/Users/alisa/Documents/Program/Project/aether/packages/ai/src/providers/register-builtins.ts)

职责：

- 管理“某个 api 对应哪个 provider 实现”
- 在模块加载时注册内置 provider

当前只有：

- `openai-chat-completions` -> `openAIApiProvider`

后续如果增加 `anthropic`、`openai responses`、`bedrock`，可以继续沿着这个注册方式扩展。

### 4. OpenAI Provider 实现层

文件：

- [packages/ai/src/providers/openai.ts](/Users/alisa/Documents/Program/Project/aether/packages/ai/src/providers/openai.ts)

职责：

- 创建 OpenAI SDK client
- 把统一 `Context` 转成 OpenAI `messages`
- 把统一 `tools` 转成 OpenAI function calling 格式
- 处理非流式 `complete`
- 处理流式 `stream`
- 把 provider 原始结果转换成统一 `CompletionResult`

实现要点：

- 当前默认走 `chat.completions`
- 支持真实流式输出 `text_delta`
- 支持聚合流式 `tool_calls`
- 保留 `raw` 原始响应，方便排障
- 暴露 `setOpenAIClientFactory()`，方便单元测试替换真实 client

### 5. 统一入口层

文件：

- [packages/ai/src/stream.ts](/Users/alisa/Documents/Program/Project/aether/packages/ai/src/stream.ts)
- [packages/ai/src/index.ts](/Users/alisa/Documents/Program/Project/aether/packages/ai/src/index.ts)

职责：

- 对外暴露统一的 `stream()` / `complete()`
- 自动解析默认 model
- 自动查找匹配的 provider

调用链路如下：

```text
业务调用 complete()/stream()
  -> resolveModel()
  -> requireProvider()
  -> openAIApiProvider.complete()/stream()
  -> OpenAI SDK
```

## 当前行为

### complete()

适合一次性拿到完整回答。

返回统一结构：

- `text`
- `finishReason`
- `usage`
- `toolCalls`
- `raw`

### stream()

适合边生成边消费输出。

当前会产出这些事件：

- `start`
- `text_delta`
- `tool_call`
- `done`

其中 `done` 会带一份聚合后的最终结果，因此上层不必自己再二次拼装全文。

## 为什么现在选 chat.completions

当前项目 README 给出的默认配置是 DashScope 的 OpenAI-compatible 网关，因此现阶段优先实现 `chat.completions`，因为它兼容性更直接，真实测试也更稳定。

如果以后项目明确切到 OpenAI 原生 `responses` API，可以新增一个新的 api/provider，而不是推翻当前结构。

## 测试

测试在项目根目录 [tests](/Users/alisa/Documents/Program/Project/aether/tests) 下。

### 单元测试

- [tests/ai/models.test.ts](/Users/alisa/Documents/Program/Project/aether/tests/ai/models.test.ts)
- [tests/ai/stream.test.ts](/Users/alisa/Documents/Program/Project/aether/tests/ai/stream.test.ts)
- [tests/core/config.test.ts](/Users/alisa/Documents/Program/Project/aether/tests/core/config.test.ts)

这些测试主要验证：

- 配置读取
- model 解析
- provider 注册
- 请求参数映射
- 流式事件聚合

### 真实集成测试

- [tests/ai/e2e.test.ts](/Users/alisa/Documents/Program/Project/aether/tests/ai/e2e.test.ts)

这组测试会真的发请求到你配置的模型网关，验证：

- `complete()` 能否成功返回
- `stream()` 能否成功流式返回

运行方式：

```bash
npm run test:ai:e2e
```

## 后续可扩展方向

1. 在 `UsageCost` 中接入真实价格表，计算 token 成本
2. 为 `tool result` 增加更完整的消息结构
3. 增加更多 provider，例如 `anthropic`、`bedrock`、`openai responses`
4. 把多轮 agent session 相关状态继续往 `engine` 层抽离，保持 `ai` 包只负责模型调用
