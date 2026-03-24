# OpenMnemo 记忆树与上下文压缩架构 v1
> 日期：2026-03-24
> 目标绑定：`goal_v003_20260324.md`
> 相关讨论来源：
> - `Memory/doubao_20260321101654_https_github_com_openmnemo_o.txt`
> - `Memory/doubao_20260316153420_是这样的_OpenClaw就是O_P_E_N_C_L_A_W.txt`

---

## 1. 核心结论

OpenMnemo 的上下文压缩，不应被设计成“把历史内容压成更短摘要”，而应被设计成：

**把历史内容组织成可导航、可递进展开、可回填原文的记忆树体系。**

压缩的对象不是“事实本身”，而是：

- 进入当前模型上下文的路径
- 进入当前模型上下文的粒度
- 进入当前模型上下文的深度

因此，OpenMnemo 的完整结构不应是一棵单树，而应是三层结构：

- `Session Tree`：单一会话的记忆树
- `Repo Tree`：单一仓库的记忆树
- `Global Memory Forest`：所有仓库之上的全局记忆森林

同时配套：

- `Probe Pipeline`：探针式递进检索
- `Graph Layer`：跨主题、跨仓库、跨分区的关系连接
- `Budget Profiles`：按不同模型上下文预算动态控制压缩强度

---

## 2. 基本原则

### 2.1 不做有损摘要替代原文

- 原始对话必须保留
- 任意压缩节点都只是索引、锚点、里程碑，不是事实源
- 最终回答可在必要时回填原始对话或原始文档

### 2.2 压缩进入上下文的路径

- 树节点负责导航
- probe 负责逐层下钻
- graph 负责跨树关联
- vector / FTS 负责召回入口

### 2.3 命中即止

- 不为“可能有用”而全量灌入
- 不因模型窗口更大就默认把更多历史塞进去
- 只给当前任务最小必要上下文

### 2.4 Git/Gitea 负责事实、版本、同步

- Git/Gitea 是事实层、版本层、隔离层
- 运行时记忆树是逻辑导航结构
- 二者可映射，但不应简单等同

### 2.5 分身是视图，不是物理复制

- 每个分身不应复制一整套全局记忆
- 每个分身应拥有自己独立的“记忆树视图”
- 视图由 scope、角色、权限、隐私策略决定

---

## 3. Session Tree：单一会话的记忆树

### 3.1 目标

Session Tree 的目标是：

- 让超长对话不会线性膨胀
- 让当前模型始终只读会话中的最小必要片段
- 让会话内部的主线、分支、细节都可被追踪

### 3.2 最小层级

建议固定为四层：

```text
SessionRoot
├── StageNode
│   ├── MilestoneNode
│   │   ├── ArchiveBatch
│   │   │   ├── ConversationLeaf
│   │   │   ├── ConversationLeaf
│   │   │   └── ConversationLeaf
```

### 3.3 各层职责

#### `ConversationLeaf`

最小语义单元，不建议死板绑定“每 3 轮”。

更合理的触发单位：

- 1-3 个 user turn
- 一个明确主题片段
- 一次大型工具输出
- 一次明确的结论或转折

#### `ArchiveBatch`

小范围收敛节点。

职责：

- 聚合若干相近 leaf
- 形成局部锚点
- 保留局部线索与局部主题

#### `MilestoneNode`

阶段性里程碑。

建议只记录高价值内容：

- 形成了什么结论
- 做了什么决策
- 确立了什么约束
- 暂时未解决什么问题

#### `StageNode`

更高层的会话主线节点。

职责：

- 标识会话当前阶段
- 串起多个 milestone
- 提供低成本导航入口

### 3.4 Session Tree 的压缩触发

不要只按固定轮次压缩，建议组合四类信号：

- `轮次触发`
  - 例如累计 2-4 个 user turn
- `token 触发`
  - 当前活跃上下文接近预算上限
- `主题漂移触发`
  - 文件集、关键词、意图、人物/项目/任务焦点明显变化
  - 对纯对话场景，可按目标、人物、事件、时间段的切换判定
- `工具洪峰触发`
  - 出现大段代码、日志、终端输出

### 3.5 Session Tree 的核心字段

建议每个节点至少有：

- `id`
- `session_id`
- `node_type`
- `parent_id`
- `child_ids`
- `title`
- `summary`
- `anchor_text`
- `keywords`
- `scope_id`
- `evidence_refs`
- `raw_refs`
- `created_at`
- `updated_at`
- `weight`

### 3.6 Session Tree 的 probe 路径

单会话检索建议复用统一最小接口，不再为 session 层单独发明一套公开 API：

1. `probe_main(query, session_id)`
2. `probe_branch(node_id, query?)`
3. `probe_leaf(node_id)`
4. `hydrate_raw(raw_ref)`

其中 `session_id` 是 `root_ref`，`milestone / stage` 与 `batch / leaf` 通过 `node_type` 区分。

### 3.7 Session 层停止规则

- 主线节点已足够回答，停止
- 分支节点已补足细节，停止
- 叶子节点已提供可验证证据，停止
- 必须核对原文时才回填 raw

---

## 4. Repo Tree：单一仓库的记忆树

### 4.1 目标

Repo Tree 的目标不是保存所有会话原文，而是回答：

- 这个仓库长期在做什么
- 为什么这么做
- 做到哪了
- 哪些经验已经沉淀成可复用技能

### 4.2 基本结构

建议 Repo Tree 不是简单“会话树拼盘”，而是：

```text
RepoRoot
├── MainlineStage
│   ├── RepoMilestone
│   ├── RepoMilestone
│   └── RepoMilestone
├── WorkstreamBranch(memory)
├── WorkstreamBranch(report-chat)
├── WorkstreamBranch(gitea)
├── SkillBranch
└── ProductBranch
```

### 4.3 Repo Tree 的叶子来源

Repo Tree 的叶子不应直接使用原始对话，而应使用：

- `session milestone`
- `decision nodes`
- `skill candidates`
- `product artifacts`

也就是：

**Session Tree 先压一层，Repo Tree 再吃压过的一层结果。**

### 4.4 Repo Tree 的核心节点类型

#### `WorkstreamNode`

表示一条持续工作线。

例如：

- memory tree
- report chat
- gitea adapter
- retrieval runtime

#### `DecisionNode`

记录仓库关键取舍。

例如：

- Git commit 只做事件层，不等于运行时记忆对象
- source_asset 当前是 transcript source，不等于 ProductAsset

#### `SkillNode`

记录从仓库实践里沉淀出的可复用能力。

例如：

- unit-first retrieval
- mixed recall fusion
- transcript extraction baseline

#### `ProductNode`

记录产品性结果。

例如：

- API
- 文档
- 报告页功能
- 配置能力

### 4.5 Repo Tree 的输入来源

建议 Repo Tree 主要吃四类输入：

- Session Tree milestone
- Git commit context
- ProductAsset 候选对象
- SkillAsset 候选对象

### 4.6 Repo Tree 的 probe 路径

建议单仓库检索时也复用同一套最小接口：

1. `probe_main(query, repo_id)`
2. `probe_branch(node_id, query?)`
3. `probe_leaf(node_id)`
4. `hydrate_raw(ref)`

其中 `workstream / repo milestone / session leaf / artifact leaf` 仍通过 `node_type` 区分，不再额外暴露 `probe_repo_main / probe_workstream` 这类平行公开接口。

### 4.7 Repo Tree 典型回答场景

Repo Tree 应能稳定回答：

- 为什么这个仓库走到今天这条路
- 某条 workstream 曾经踩过哪些坑
- 当前阶段有哪些已定决策
- 哪些实践已经上升为 skill

---

## 5. Global Memory Forest：所有仓库的全局记忆森林

### 5.1 为什么不是“一棵全局树”

所有仓库之上不建议强行做成一棵树，因为：

- 一个仓库可能同时属于多个主题
- 一个 skill 会跨多个仓库
- 一个决策可能跨工作、个人、家庭
- 权限隔离与分身授权难以落到单树上

因此，全局层更适合：

**森林负责压缩导航，图负责跨域关联。**

### 5.2 建议结构

```text
GlobalForest
├── RepoIndex
│   ├── RepoRoot(openmnemo)
│   ├── RepoRoot(client-a)
│   ├── RepoRoot(content-studio)
│   ├── RepoRoot(life-os)
│   └── RepoRoot(reading-notes)
├── ScopeView(work)
│   ├── Mount(openmnemo)
│   ├── Mount(client-a)
│   └── Mount(content-studio)
├── ScopeView(personal)
│   ├── Mount(life-os)
│   └── Mount(reading-notes)
├── ScopeView(family)
└── ScopeView(shared)
    └── Mount(openmnemo: shared skill / public milestone)
```

说明：

- `RepoRoot` 是底层唯一身份
- `ScopeView` 只保存挂载关系或投影视图，不复制 repo 原文
- 同一 repo 可同时挂到多个 scope，是否可见由权限与视图层裁剪决定

### 5.3 Global 层的核心作用

- 做跨仓库导航
- 做跨分区授权视图
- 做长期目标与长期主题聚合
- 为“心跳机制”提供全局复盘入口

### 5.4 Global 层不直接存什么

不建议直接把全量原文和大段细节挂在 Global 层。

Global 层只适合保留：

- scope 主线
- repo 主线
- 跨仓库 milestones
- 全局 skill
- 全局目标

### 5.5 Global 层与 Graph Layer 的关系

Global Forest 不是 Graph 的替代品。

建议分工：

- `Forest`
  - 压缩导航
  - 分区隔离
  - 长期主线

- `Graph`
  - 跨 scope 关联
  - 跨 repo skill 迁移
  - 跨主题灵感串联

### 5.6 分身在 Global 层的形态

“每个分身都有自己独立的记忆树”应解释为：

**每个分身拥有自己独立的记忆树视图。**

视图由以下维度裁剪：

- `scope`
- `project`
- `persona`
- `privacy_level`
- `allow_cross_scope`

例如：

- 工作分身默认只能看 `work`
- 家庭分身默认只能看 `family`
- 战略分身可看 `work + shared`
- 只有显式授权时才允许跨 scope 引入敏感内容

---

## 6. Probe Pipeline：探针式递进检索

### 6.1 总体目标

Probe Pipeline 负责控制：

- 从哪一层开始找
- 要不要继续往下钻
- 什么时候停止
- 什么时候需要回填原文

### 6.2 推荐执行顺序

```text
Intent Parse
→ Scope Select
→ Tree Level Select
→ probe_main
→ probe_branch
→ probe_leaf
→ hydrate_raw
→ answer
```

### 6.3 停止判断

建议采用“机制优先、模型兜底”的原则。

刚性条件至少包括：

- 命中层级
- 信息完整度
- 事实来源是否存在
- 当前预算是否触线
- 是否已覆盖用户问题中的核心实体/时间/项目

### 6.4 兜底入口

当 tree probe 不足以命中时，可开放：

- `full_search(query, scope_id)`

它属于兜底检索，而不是 tree 的最小公开接口。

它不直接进回答，而是：

1. 找到候选节点
2. 再回到 probe 路径逐层展开

---

## 7. Model Budget Profiles：按模型上下文预算做压缩规划

### 7.1 核心原则

不要按模型“标称总窗口”规划，而应按：

**有效记忆预算**

```text
有效记忆预算
= 模型总窗口
- system prompt
- tool schema
- 用户输入
- 预留输出空间
```

### 7.2 五档预算模型

#### `S` 档：极小预算

只给：

- 当前轮
- Session 主线节点
- 1 个 Repo milestone
- 1 个小 raw snippet

特点：

- 不进 Global 层
- 最多 probe 到 branch

#### `M` 档：小预算

只给：

- 当前轮
- Session 主线
- 1-2 个 branch
- 1 个 Repo milestone
- 1 个 Skill 节点

特点：

- raw 只给片段
- 最多 probe 到 leaf

#### `L` 档：中预算

可给：

- Session 主线
- Repo 当前 workstream
- 相关 skill
- 少量 Global anchor
- 2-4 个 raw snippets

特点：

- 可做一次 cross-branch 关联

#### `XL` 档：大预算

可给：

- Session Tree 主线 + 多 branch
- Repo Tree 当前阶段
- Global scope 中相关主线
- 多个 raw evidence

特点：

- 适合复杂规划、复杂代码任务

#### `XXL` 档：超大预算

原则仍然不是全量灌入。

特点：

- 只是提高 raw evidence 比例
- 适合长审查、长复盘、长规划

### 7.3 任务模板

同一预算档下，也应按任务类型调配比例。

#### `问答模板`

- Session 70%
- Repo 20%
- Global 10%

#### `代码开发模板`

- Repo 50%
- Session 30%
- Skill 20%

#### `复盘模板`

- Repo 40%
- Global 30%
- Session 30%

#### `跨仓库灵感模板`

- Global 40%
- Repo 35%
- Session 25%

---

## 8. 与当前 OpenMnemo 实现的映射建议

### 8.1 当前对象如何承接

现阶段可先这样映射：

- `memory_unit`
  - 更接近 Session Tree 的 leaf 层素材

- `archive_anchor`
  - 更接近 Session Tree / Repo Tree 的锚点层素材

- `source_asset`
  - 更接近来源/证据层对象

- `session`
  - 更接近当前的会话级容器对象

### 8.2 短期不要做的事

- 不要立刻用新树模型替换现有 `DataLayerAPI`
- 不要把 Git commit 树直接当运行时树
- 不要把所有仓库强行塞成一棵树
- 不要为每个分身物理复制全量记忆

### 8.3 短期建议路线

#### Phase A

- 先把 Session Tree 落成正式数据结构
- 让 `memory_unit + archive_anchor` 能映射到 `leaf / batch / milestone`

#### Phase B

- 在 Repo 级别引入 workstream / repo milestone
- 让 repo 查询不再只靠 session 聚合

#### Phase C

- 引入 Global Forest 视图层
- 再叠加 Graph 的跨仓库关系

#### Phase D

- 做 model budget profiles
- 让不同模型与不同任务模板共享同一 probe pipeline

---

## 9. 一句话总结

OpenMnemo 的记忆压缩架构，不应是“把越来越多的历史缩成越来越短的摘要”，而应是：

**Session Tree 管单会话，Repo Tree 管单仓库，Global Memory Forest 管所有仓库；Probe Pipeline 管递进展开，Graph 管跨域关联，Git/Gitea 管事实与版本，Budget Profiles 管不同模型下的上下文压缩强度。**
