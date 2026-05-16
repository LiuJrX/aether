# Aether
Aether 是一个轻量 agent runtime，用来接收任务、加载 agent/workflow、调度 LLM session、拦截工具调用、记录 trace、管理 artifacts，并为未来的 MCP tools 和垂类 agents 预留扩展接口。


启动链路：

```
apps/cli 或 apps/api
  ↓
WorkflowRunner.run()
  ↓
WorkflowLoader.load(workflowPath)
  ↓
RunStore.createRun()
  ↓
Observer.emit(workflow_started)
  ↓
TaskRunner.run(task)
  ↓
AgentEngine.runTask()
  ↓
AgentLoop
  ↓
ToolInterceptor
  ↓
ToolRegistry / MCP / Builtin Tools
  ↓
Observer / Storage
```

Observer 怎么同时观测 workflow 和 agent
使用统一 EventBus。

```
WorkflowRunner
  emits workflow_started / task_started / task_finished

AgentEngine
  emits agent_session_started / agent_plan_created / agent_decision

Tools
  emits tool_call_requested / tool_call_finished / tool_call_blocked

Storage
  emits artifact_created

Observer
  consumes all events
  builds timeline
  persists trace
```

也就是：

```
workflow ─┐
engine ───┼──→ observer
tools  ───┤
storage ──┘
```

Observer 是旁路，不阻塞主流程。
只有 circuit-breaker 触发时，才通知 workflow / engine 暂停。