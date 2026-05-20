

```
外层：agentLoop() 返回的 stream
类型：EventStream<AgentEvent, AgentMessage[]>
作用：把整个 agent 运行过程的事件发给 UI / 调用方

内层：streamSimple() 返回的 stream
类型：AssistantMessageEventStream
作用：接收某一次模型生成 assistant message 的流式事件
```

```
agentLoop()
  作用：对外入口；创建一个“整个 agent 运行过程”的 AgentEvent stream，并立即返回给调用方
  ↓
  createAgentStream()
  创建外层 EventStream<AgentEvent, AgentMessage[]>
  ↓
  异步启动 runAgentLoop(...)
    作用：
      - 初始化本次新增消息 newMessages
      - 把 prompts 合并进当前上下文 currentContext
      - 发出 agent_start / turn_start 事件
      - 把用户 prompts 包装成 message_start / message_end 事件
      - 调用 runLoop(...) 执行真正的 agent 循环
      - 最后返回本次新增的所有消息
    ↓
    runLoop(...)
      作用：真正的 agent 循环；负责多轮调用模型、执行工具、判断是否继续
      ↓
      第一次调用模型：
      streamSimple(...) 返回 AssistantMessageEventStream
      ↓
      消费模型事件
      把 AssistantMessageEvent 转换 / 包装成 AgentEvent
      然后 emit 到外层 AgentEvent stream
      ↓
      如果 assistant message 里有 toolCall：
      执行工具
      ↓
      工具结果加入上下文
      ↓
      第二次调用模型：
      streamSimple(...) 返回新的 AssistantMessageEventStream
      ↓
      消费模型事件
      再次 emit AgentEvent 到外层 stream
      ↓
      没有更多 toolCall，或满足停止条件
      ↓
      agent 结束
  ↓
  runAgentLoop resolve(messages)
  ↓
  stream.end(messages)
  结束外层 AgentEvent stream，并把 AgentMessage[] 作为最终结果
```
