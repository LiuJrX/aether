# Aether

Aether 是一个轻量 agent runtime，用来加载 workflow、驱动 Pi session、接入远程 MCP 工具，并把一次运行的系统元数据与业务产物统一落到 `.aether/` 目录下。

## 当前阶段

当前仓库已经具备这些能力：

- 通过 `aether run workflow_name` 运行标准目录下的 workflow
- 使用 `@earendil-works/pi-coding-agent` 作为底层 agent runtime
- 从项目根目录 `.env` 读取大模型配置
- 接入远程 MCP，并把可用工具暴露给 Pi
- 在运行时记录结构化事件、stage turn 快照和 run 元数据
- 将 workflow 业务产物与 Aether 系统文件分目录落盘

## 目录约定

### Workflow 目录

每个 workflow 都放在：

```text
.aether/workflows/<workflow_name>/<workflow_name>.workflow.yaml
```

例如：

```text
.aether/workflows/research/research.workflow.yaml
```

### Run 目录

每次运行都会生成纯数字 `run_id`，格式为：

```text
YYYYMMDDHHmmss + 4位随机数
```

产物目录固定为：

```text
.aether/runs/<workflow_name>_<run_id>/
  aether/
    run.json
    stages/
      <stage_index>/
        turns.json
  workspace/
    shared/
    stages/
      <stage_index>/
```

说明：

- `aether/`：Aether 系统元数据
- `workspace/shared/`：跨 stage 共享工作目录
- `workspace/stages/<stage_index>/`：当前 stage 默认工作目录
- `stage_index` 从 `0` 开始，作为运行期稳定目录键

## 运行方式

安装依赖：

```bash
pnpm install
```

运行一个 workflow：

```bash
pnpm exec aether run research
```

调试用 demo 脚本仍然保留：

```bash
pnpm run:research
```

说明：

- `aether run research` 会自动读取 `.aether/workflows/research/research.workflow.yaml`
- CLI 默认输出运行摘要和本次 `runDir`
- `scripts/` 下的脚本只用于 demo/debug，不是正式入口

## 日志与输出

CLI 支持两类环境变量：

```bash
AETHER_LOG_LEVEL=quiet|normal|verbose
AETHER_OUTPUT_FORMAT=summary|json
```

示例：

```bash
AETHER_LOG_LEVEL=verbose AETHER_OUTPUT_FORMAT=summary pnpm exec aether run research
```

`verbose` 模式下会打印：

- session 创建
- workflow / stage 生命周期
- stage 激活工具
- tool start / end
- tool 结果预览
- assistant 流式输出

## Workflow 运行上下文

运行时会自动向模板注入以下变量：

- `workflowName`
- `runId`
- `runDir`
- `sharedDir`
- `stageIndex`
- `stageDir`
- `previous`

其中：

- `stageDir` 指向 `workspace/stages/<stage_index>/`
- `sharedDir` 指向 `workspace/shared/`
- `write` 工具的相对路径默认相对于当前 `stageDir` 解析

这意味着 workflow 里的业务产物会默认写进当前 stage 的工作目录，而不是项目根目录。

## 运行时分层

当前实现分成这几层：

- [packages/cli](packages/cli)：正式 CLI 入口与终端 presenter
- [packages/sdk](packages/sdk)：对外运行入口与编排层
- [packages/workflow](packages/workflow)：workflow 加载、模板渲染、stage 执行
- [packages/pi](packages/pi)：Pi session 创建、tool 注入、agent loop 事件采集
- [packages/observer](packages/observer)：结构化运行事件协议
- [packages/storage](packages/storage)：run storage 与 `.aether/runs` 持久化
- [extensions/remote-mcp](extensions/remote-mcp)：远程 MCP 接入

## Stage Loop 可观测性

Aether 不会暴露模型内部推理，但会记录 stage 内可观测的外显过程。

当前已经结构化记录：

- `workflow.started` / `workflow.finished`
- `stage.started` / `stage.finished`
- `stage.turn.started` / `stage.turn.completed`
- `tool.started` / `tool.finished`
- `assistant.delta` / `assistant.completed`

其中：

- `run.json` 保存整次运行摘要
- `turns.json` 保存每个 stage 的每轮 assistant 完整输出与工具调用摘要
- token 级 `assistant.delta` 用于实时显示，不写入 `turns.json`

## 测试

类型检查：

```bash
pnpm typecheck
```

测试：

```bash
pnpm test
```

## 当前边界

当前版本的明确边界如下：

- 只实现本地文件系统 run storage
- workflow schema 仍然保持最小集合
- MCP 当前主要以 tool 能力接入，不覆盖更复杂的资源模型
- 前端界面还没有接入，但事件流和 run storage 已经为前端消费预留
