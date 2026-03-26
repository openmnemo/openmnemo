# OpenMnemo 技术说明

## 1. 先统一一句话定位

基于当前 MemoryTree 主线，OpenMnemo 的正式方向已经不是“AI 对话归档工具”，而是“开源的创造资产内核”；但从代码现实看，当前真正稳定落地的仍然是“跨平台 AI 会话记忆底座”，资产内核部分正在从规划文档向类型、schema 和运行时收口。

这份文档的目标，是把“已经做完的、正在做的、绝不能抢跑的”三件事讲清楚。

## 2. 当前项目共识

### 北极星

当前目标文件 `goal_v003_20260324.md` 的核心已经很明确：

- OpenMnemo 要从“AI 对话记忆底座”升级为“创造资产内核”
- 统一沉淀创作结果、创作过程、创作能力
- 上层任何产品都应该基于这层资产底座来调用，而不是重新造一套记忆

### 当前阶段闸门

当前 todo 的阶段闸门同样明确：

- 先把记忆调用做得稳定、准确、可回放、可追溯
- 不允许 super-agent 编排或重型上层体验抢跑
- 当前优先级是 contract、schema、projection、runtime substrate，而不是大而全产品外壳

这意味着团队在未来一段时间内，必须坚持“底层优先，体验后置”。

## 3. 仓库当前真实代码结构

项目是一个 `pnpm + turborepo + TypeScript` 的 monorepo，核心包如下：

- `packages/types`
  - 共享类型定义，包含 transcript、memory、chat 等协议
- `packages/core`
  - 解析、导入、索引、抽取、检索、聊天运行时等核心能力
- `packages/report`
  - 静态报告生成、图谱页、搜索页、项目页、报告内聊天前端
- `packages/sync`
  - heartbeat、配置、锁、告警、后台同步
- `packages/cli`
  - 命令行入口和 report server

CI 已经存在，当前是 GitHub Actions 下 Ubuntu/Windows、Node 22/24 的 `build + typecheck + lint + test` 矩阵。

## 4. 已经落地的能力

### 4.1 Transcript 采集与导入闭环

`packages/core/src/transcript/*` 已经具备完整的基础闭环：

- 自动识别并解析 Codex、Claude、Gemini、Doubao transcript
- 自动推断项目归属
- 将 raw / clean / manifest / extraction bundle 写入 `Memory/06_transcripts`
- 写入全局 transcript 索引与事件日志

其中 Doubao 文本导入已经不是概念，而是正式 parser。

### 4.2 搜索与数据层

当前底层检索能力已经可用：

- SQLite `better-sqlite3` 全文索引
- `memory_unit` 级别的 deterministic 向量检索
- SQLite 图适配器用于关系查询
- `DataLayerAPI` 统一对外暴露 `search / getSession / listSessions / getCommitContext / getEntityGraph`

要注意一点：当前项目 README 与旧文档里有些 “FTS5” 表述，但当前实际实现是 FTS4，这种文档与代码不一致需要后续统一。

### 4.3 记忆抽取基线

当前已经存在 deterministic extraction baseline：

- `SourceAsset`
- `MemoryUnit`
- `ArchiveAnchor`
- 对应 graph nodes / edges
- 对应向量写入逻辑

这说明我们已经从“只存 transcript”迈出了第一步，开始把会话拆成可检索对象；但这还不是最终资产层，只是过渡态。

### 4.4 报告与本地 AI Chat

`packages/report` 与 `packages/cli/src/cmd-report.ts` 已经形成一条非常关键的产品闭环：

- `openmnemo report build`
- `openmnemo report serve`
- 本地 HTTP 服务
- `/api/chat` 和 `/api/chat/health`
- 报告页内置聊天面板
- SSE 流式返回
- 基于 `DataLayerAPI.search(target: 'mixed')` 的上下文组装

这意味着项目已经有了一个“统一入口”的原型，只是目前还停留在 session/memory-unit 级 recall，而不是未来的树式 probe runtime。

### 4.5 Heartbeat / Daemon

`packages/sync` 和 `packages/cli/src/cmd-daemon.ts` 已经落地：

- 配置读写
- 锁机制
- 告警记录
- 定时 discover/import
- 可选 git commit/push
- 可选 report build
- Windows Task Scheduler / cron / launchd 注册

从系统形态看，这已经具备“后台持续沉淀记忆”的基础设施特征。

## 5. 当前明确存在但尚未真正落地的部分

这是团队最需要保持清醒的地方。

### 5.1 创造资产内核仍主要停留在 contract 层

`Memory/04_knowledge/OpenMnemo_创造资产内核实现级契约_v1_2026-03-24.md` 里定义的这些关键对象：

- `TreeNodeRecord`
- `AssetRecord`
- `ProductAssetRecord`
- `MemoryAssetRecord`
- `SkillAssetRecord`
- `AssetLayerAPI`
- `index/asset-layer.sqlite`

目前仍然主要存在于文档设计里，代码层尚未形成真正可运行的正式实现。

### 5.2 记忆树与探针式检索还没有成为当前 runtime 主干

`Session Tree / Repo Tree / Global Memory Forest / Probe Pipeline / Budget Profiles` 已经在规划上很完整，但当前 runtime 实际还是：

- `session`
- `memory_unit`
- `source_asset`
- `archive_anchor`
- `mixed recall`

也就是说，我们已经有“树的方向”，但还没有“树的引擎”。

### 5.3 多后端扩展仍然只是接口预埋

从 `storage/factory.ts` 看，项目已经为未来后端扩展留了口子：

- 向量：`sqlite-vec`、`qdrant`
- 图：`sqlite`、`neo4j`

但代码现实是：

- `sqlite-vec` 可用
- `sqlite graph` 可用
- `QdrantVectorAdapter` 仍是 Phase 1 stub
- `Neo4jGraphAdapter` 仍是 Phase 1 stub

所以当前对外叙事必须谨慎，不能把“接口存在”讲成“多后端能力已完成”。

### 5.4 Gitea 方向存在，但不是当前主运行路径

仓库里已经有 `GiteaAdapter`，说明项目长期路线里确实包含 Gitea/GitHub 兼容层；但当前主干仍然是：

- 本地文件系统
- Git 命令
- 本地 SQLite

Gitea 更像已经被验证过方向、但尚未成为核心运行路径的适配器能力。

## 6. 现在最重要的技术判断

### 判断一：不要推翻 `DataLayerAPI`

当前最正确的路径，不是把 `session / memory_unit / source_asset / archive_anchor` 整套推翻，而是：

- 保持 `DataLayerAPI` 作为稳定事实检索面
- 在其上增加 projection layer
- 让 `AssetLayerAPI` 成为新的运行时外壳

这和现有 Memory 文档里的结论一致，也是避免迁移失控的唯一可执行路线。

### 判断二：把“资产层”理解为投影层，而不是替换层

当前已经有大量真实数据和真实索引沉淀在现有对象体系里，因此最稳的做法是：

- 现有对象继续作为事实层和过渡对象
- 新资产层做 materialized projection
- `TreeNodeRecord` 负责导航
- `AssetRecord` 负责长期复用对象

这能最大限度保护已有代码和数据，不会因为一次命名升级导致全链路重写。

### 判断三：先做 session 级树，再谈 repo/global

最务实的执行顺序应该是：

1. `packages/types` 落 `TreeNodeRecord / AssetRecord / AssetLayerAPI`
2. 建立 `index/asset-layer.sqlite`
3. 先把 transcript extraction bundle 投影成 `conversation_leaf / archive_batch / session_milestone`
4. 在 session 范围实现第一版 `probeMain / probeBranch / probeLeaf`
5. 再扩到 repo tree 和 global view

如果跳过 session 级直接做 global，会非常容易把模型、存储、权限、预算、视图全部搅在一起。

## 7. 建议团队接下来 30/60/90 天怎么做

### 未来 30 天

- 统一 README、Memory 文档、代码注释里的定位表达
- 把“已实现”和“规划中”严格拆开
- 落类型：`TreeNodeRecord / AssetRecord / AssetLayerAPI`
- 落第一版 `asset-layer.sqlite` schema
- 定义 session 级 projection 输入输出与幂等规则

### 未来 60 天

- 跑通 transcript bundle → session tree projection
- 增加 `probeMain / probeBranch / probeLeaf / hydrateRaw`
- 让 report chat 可以选择性切到资产层 recall
- 为 budget profiles 预留真正的 runtime 接口

### 未来 90 天

- repo 级 workstream / repo milestone materialization
- 更细的 skill candidate 投影
- 浏览器侧导入/连接器进一步补齐
- 清理 memorytree/openmnemo 命名混杂问题

## 8. 当前不应该做的事

以下事情方向没错，但现在做会打乱主线：

- 完整 super-agent harness
- 重型多 agent 编排 UI
- 企业级权限、计费、审计系统
- 技能市场、记忆包市场、复杂商业授权体系
- 把所有全局记忆直接做成一个大而全的总树

这些能力都依赖同一个前提：底层记忆调用必须已经足够稳定、精准、可回放、可追溯。现在这个前提还没有完全成立。

## 9. 需要团队特别注意的风险

### 风险一：产品叙事超前于代码现实

当前项目愿景很强，但如果对外说法不够克制，容易把：

- 已经实现的“记忆管理闭环”
- 与规划中的“创造资产内核”

混在一起。技术、产品、对外沟通都必须严格区分。

### 风险二：旧文档与新主线并存

仓库里同时存在几套不同时期的话语体系：

- 记忆管理工具
- 个人 AI 记忆中枢
- 创造资产内核

这不是坏事，但内部必须统一成一条主线，否则会影响类型命名、接口边界和优先级判断。

### 风险三：配置项先暴露，能力后补齐

当前 `vector_backend`、`graph_backend` 等配置已经存在，但多后端实现并未完全落地。对内要明确：

- 能配置，不等于已经可用
- 能切换接口，不等于可以作为当前产品卖点

## 10. 当前最准确的技术状态结论

如果用一句内部最准确的话来描述今天的 OpenMnemo：

OpenMnemo 已经是一个可运行的跨平台 AI 会话记忆基础设施，具备导入、索引、搜索、报告、后台同步和本地 AI Chat 的完整基础闭环；同时它正在从现有 `DataLayerAPI` 和 transcript extraction 体系，向更高阶的 `TreeNodeRecord + AssetRecord + AssetLayerAPI` 过渡，但这部分仍应被视为当前阶段的核心研发任务，而不是已完成能力。

团队接下来最重要的工作，不是继续扩故事，而是把这个过渡做稳。
