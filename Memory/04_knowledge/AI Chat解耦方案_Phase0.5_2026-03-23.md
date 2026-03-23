# AI Chat 解耦方案 Phase 0.5

## 背景

OpenMnemo 当前已经具备可用的数据层主干能力：

- transcript 导入与清洗
- SQLite FTS 检索
- unit-level vector 检索
- SQLite graph 检索
- `DataLayerAPI` 本地统一入口

当前缺口不是新的底层索引，而是缺少一个可被网页端、未来客户端、后续 IM 入口复用的 AI Chat 交互层。

## 结论

Phase 0.5 采用：

- 核心能力自研
- 协议先行，UI 从简
- Web 作为第一入口
- IM 不作为当前主入口，只作为后续 adapter 目标
- 不引入完整开源 AI Chat 系统作为主架构

一句话方案：

在现有代码上新增一个薄的 `ChatService` 层，由 `core` 负责检索编排与模型调用，`cli` 负责 HTTP/SSE 暴露，`report` 负责最小 widget 展示。

## 为什么不把完整开源 Chat 系统当主线

不选完整开源 Chat 系统的原因：

- 它们的中心通常是“通用会话 + 通用 RAG”，不是 OpenMnemo 的 `memory_unit / source_asset / archive_anchor / graph`
- 后续要做来源引用、结构化命中、项目级 scope、记忆回链时，改造成本会越来越高
- 前期看似快，后期容易演变成“为了适配框架而修改产品边界”

不先做 IM 主入口的原因：

- IM 适合通知、摘要卡片、轻问答，不适合承载完整记忆交互
- 真正需要沉淀的体验包括来源引用、继续追问、上下文切换、调试检索，这些更适合网页端/客户端

## 设计目标

Phase 0.5 目标：

- 用户可在本地 `report serve` 页面直接用自然语言查询记忆
- 后端复用现有 mixed retrieval，不重复造数据层
- 对外暴露稳定 chat 协议，便于网页端、客户端、IM 复用
- 流式返回回答和引用
- 在没有 API key 时优雅失败
- 在静态构建模式下优雅降级

## 非目标

Phase 0.5 不做：

- 多用户权限
- 云端会话持久化
- IM 双向完整问答
- agent orchestration
- Qdrant / Neo4j 后端实装
- 复杂的历史会话压缩与长期 memory rewrite

## 设计原则

### 1. 业务内核与传输层分离

`core` 只负责 chat 业务编排，不负责 HTTP、SSE、DOM、样式。

### 2. 协议与前端分离

前端只消费 `ChatEvent` 流，不直接依赖内部检索函数。

### 3. 模型供应商与业务分离

`LLMProvider` 只负责向模型发送上下文和流式接收结果，不感知 OpenMnemo 的索引结构。

### 4. Web 先行，但不锁死 Web

第一入口是 `report serve`，但 chat service 不依赖 report UI，可被未来桌面端或 IM adapter 直接复用。

## 架构分层

### Layer A: Chat Protocol

放在 `packages/types`

职责：

- 定义请求、响应、事件、引用结构

### Layer B: Chat Domain / Service

放在 `packages/core/src/chat/`

职责：

- 接收 `messages[]`
- 归一化 scope / options
- 调用 `DataLayerAPI.search({ target: 'mixed' })`
- 构建 prompt / context
- 调用 provider
- 生成结构化引用
- 输出流式事件

### Layer C: Transport Adapter

放在 `packages/cli`

职责：

- 暴露 `POST /api/chat`
- 把 request body 转成 `ChatRequest`
- 把 `ChatService` 输出编码成 SSE

### Layer D: Presentation Adapter

放在 `packages/report`

职责：

- 提供最小 chat widget
- 发起 `/api/chat`
- 解析 SSE
- 渲染回答与引用

## 推荐目录结构

### `packages/types`

新增：

```text
packages/types/src/chat.ts
```

定义：

- `ChatRole`
- `ChatMessage`
- `ChatScope`
- `ChatRequestOptions`
- `ChatRequest`
- `ChatCitation`
- `ChatEvent`
- `ChatResponseMeta`

### `packages/core`

新增：

```text
packages/core/src/chat/chat-service.ts
packages/core/src/chat/context-builder.ts
packages/core/src/chat/prompt.ts
packages/core/src/chat/llm-provider.ts
packages/core/src/chat/providers/anthropic.ts
packages/core/src/chat/local-chat-service.ts
packages/core/src/chat/index.ts
```

### `packages/cli`

扩展：

```text
packages/cli/src/cmd-report.ts
```

### `packages/report`

新增：

```text
packages/report/src/render/chat.ts
```

扩展：

```text
packages/report/src/render/layout.ts
packages/report/src/types.ts
packages/report/src/index.ts
```

## 对外协议

## Request

```json
{
  "messages": [
    {
      "role": "user",
      "content": "上周我们怎么讨论 unit-first retrieval 的？"
    }
  ],
  "scope": {
    "project": "openmnemo"
  },
  "options": {
    "stream": true,
    "max_context_hits": 8
  }
}
```

字段说明：

- `messages`: 当前对话历史，最小先支持 `user` / `assistant`
- `scope.project`: 当前项目过滤，默认取当前 repo project
- `options.stream`: 默认 `true`
- `options.max_context_hits`: 限制用于 prompt 的检索命中数

## SSE Event

事件流建议统一为：

- `meta`
- `retrieval`
- `delta`
- `citation`
- `done`
- `error`

示例：

```text
event: meta
data: {"model":"claude-haiku-4-5-20251001"}

event: retrieval
data: {"count":4}

event: delta
data: {"text":"我们上周讨论的核心是..."}

event: citation
data: {"kind":"memory_unit","id":"memory_unit:...","title":"..."}

event: done
data: {"finish_reason":"stop"}
```

这样设计的好处：

- Web widget 易消费
- 桌面端可直接复用
- IM adapter 可以只消费 `done` 后的聚合文本

## 检索与回答流程

服务端主流程：

1. 接收 `ChatRequest`
2. 取最后一条 user message 作为主查询
3. 调用 `DataLayerAPI.search({ target: 'mixed' })`
4. 从命中中优先抽取：
   - `memory_unit`
   - `source_asset`
   - `archive_anchor`
   - `session`
5. 生成 context block
6. 构建 system prompt + conversation history + context
7. 调用 `LLMProvider.stream()`
8. 流式吐出 `delta`
9. 单独吐出 `citation`
10. 收尾 `done`

## Context 组织策略

Phase 0.5 采用保守策略：

- 优先使用结构化命中，不直接把整个 transcript 无限制塞给模型
- 单个 `memory_unit` 直接作为最小证据块
- `source_asset` / `archive_anchor` 作为高层摘要补充
- `session.clean_content` 仅在需要时截断注入

推荐 context 排序：

1. `memory_unit`
2. `archive_anchor`
3. `source_asset`
4. `session`

## Prompt 策略

Phase 0.5 的 prompt 目标不是“更像聊天机器人”，而是“更像可追溯记忆助理”。

system prompt 约束：

- 只能优先依据提供的 context 回答
- 不确定时明确说不确定
- 尽量引用具体 session / unit
- 不编造项目历史

## LLM Provider 抽象

接口建议：

```ts
interface LLMProvider {
  stream(input: {
    system: string
    messages: Array<{ role: 'user' | 'assistant', content: string }>
  }): AsyncIterable<{ type: 'delta' | 'done' | 'error', text?: string, reason?: string }>
}
```

Phase 0.5 先实现：

- `AnthropicChatProvider`

后续可以平滑增加：

- OpenAI
- LiteLLM
- 本地兼容 OpenAI 协议的 provider

## Web 入口策略

当前推荐：

- `report build`: 静态站点，不接 AI Chat，只显示降级提示或搜索入口
- `report serve`: 本地服务模式，启用 `/api/chat`

这和现阶段代码结构一致，能最快落地而不引入新的独立 web server。

## Widget 策略

Phase 0.5 widget 最小能力：

- 右下角浮层或页面侧边面板
- 消息列表
- 输入框
- 发送按钮
- SSE 增量显示
- 引用区
- 错误区

不做复杂状态管理框架，先用当前 report 的 vanilla JS 风格，保证接入快、依赖少、后续可迁移。

## IM 策略

IM 不作为当前主入口，只保留 adapter 方案。

后续 IM 适配层职责：

- 接收外部 webhook / bot 消息
- 转调 `ChatService`
- 把最终文本和少量引用压缩回 IM 卡片

即：

```text
IM Adapter -> ChatService -> DataLayerAPI + Provider
```

而不是：

```text
IM Adapter -> 专门一套检索 / 专门一套 prompt
```

## 开发顺序

### Step 1

补 `packages/types` chat 协议

### Step 2

在 `packages/core` 新增 chat service 与 provider 抽象

### Step 3

在 `packages/cli` 扩 `report serve`：

- `POST /api/chat`
- `Content-Type: text/event-stream`

### Step 4

在 `packages/report` 注入最小 widget

### Step 5

补测试：

- core: context builder / citation mapping / service 编排
- cli: `/api/chat` 路由与 SSE
- report: widget 渲染与 SSE 解析

## 验收标准

满足以下条件即可认为 Phase 0.5 最小闭环完成：

- 本地 `openmnemo report serve` 可访问 chat
- 输入自然语言问题后能返回流式回答
- 回答后带结构化引用
- 没有 `ANTHROPIC_API_KEY` 时返回清晰错误
- 不影响现有 `report build`
- 协议层、transport 层、UI 层相互独立

## 风险与处理

### 风险 1: 直接把 chat 写进 report 页面逻辑，后续难迁移

处理：

- 业务逻辑放 `core`
- report 仅消费协议

### 风险 2: CLI 层混入 prompt 与检索逻辑

处理：

- CLI 只做 HTTP/SSE adapter

### 风险 3: 静态站点与本地 serve 模式行为不一致

处理：

- 明确 `serve` 启用 AI Chat
- 明确 `build` 先降级

### 风险 4: 一开始就做 IM，范围扩散

处理：

- 先把 Web 入口跑通
- IM 延后为 adapter

## 最终决策

当前阶段的最佳方案是：

- 不接完整开源 AI Chat 系统做主架构
- 不先做 IM 主入口
- 自研一个薄的 `ChatService + SSE API + 最小 Web Widget`

这是最快上线、最不返工、最符合 OpenMnemo 长期演进方向的路径。

## Review 记录

### Review 1: 架构边界复核

结论：通过。

- `core` 持有 chat 业务编排、检索与 provider 抽象
- `cli` 只负责 HTTP/SSE transport，不承载 prompt 与 retrieval 逻辑
- `report` 只负责 widget 展示与 SSE 消费
- `report serve` 继续作为本地 AI Chat 模式；`report build` 保持静态构建职责

### Review 2: 代码贴合度复核

结论：通过，可直接进入实现。

- 现有 `DataLayerAPI` 已能提供 mixed retrieval，无需重做数据层
- 现有 `report` 页面生成链路统一经过 `htmlShell`，适合注入最小 chat widget
- 现有 Anthropic 使用方式可沉到 provider 实现层，不需要引入完整开源 chat 框架
- 后续客户端或 IM 入口可直接复用协议层与 `ChatService`
