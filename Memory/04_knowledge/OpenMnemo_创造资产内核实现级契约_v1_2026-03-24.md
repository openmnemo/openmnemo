# OpenMnemo 创造资产内核实现级契约 v1
> 日期：2026-03-24
> 目标绑定：`goal_v003_20260324.md`
> 相关规划稿：
> - `Memory/04_knowledge/创造资产内核对象模型_2026-03-24.md`
> - `Memory/04_knowledge/OpenMnemo_记忆树与上下文压缩架构_v1_2026-03-24.md`
> 代码现实参考：
> - `packages/types/src/memory.ts`
> - `packages/core/src/memory/data-layer-api.ts`
> - `packages/core/src/memory/local-runtime.ts`
> - `packages/core/src/memory/extraction.ts`

---

## 1. 这份契约要解决什么

这份文档不是再讨论“方向对不对”，而是把当前已经确认的方向压成一份可编码的 contract。

目标只有四个：

- 不推翻当前 `DataLayerAPI`
- 把三类资产模型压成正式字段与接口
- 把记忆树压成正式节点 schema
- 把 Git/Gitea、FTS、vector、graph、runtime API 的职责边界钉死

这意味着本轮的实现原则是：

- 先做 `projection layer`
- 不直接把当前运行时 kind 全部改名
- 不把 Git commit 树硬当运行时记忆树
- 不让新资产层和旧数据层平行失控

---

## 2. 四层运行时分工

OpenMnemo 当前和下一阶段，应明确分成四层：

### 2.1 Evidence Layer：事实层

事实层只存原始证据与版本事实。

包含：

- 原始 transcript
- clean transcript
- repo 文件
- Git commit 历史
- workflow 运行产物
- import manifest

这一层的原则：

- 是最终证据源
- 可被版本化
- 可被回溯
- 不因为压缩而丢失

### 2.2 Index Layer：索引层

索引层负责快，不负责成为唯一事实源。

包含：

- `index/search.sqlite`
- FTS 候选索引
- vector recall 索引
- graph 索引
- extraction bundle 的索引入口

这一层的原则：

- 可以重建
- 允许局部失效后再生成
- 不能成为唯一真相

### 2.3 Projection Layer：投影层

投影层负责把事实层和索引层组织成：

- `TreeNodeRecord`
- `ProductAssetRecord`
- `MemoryAssetRecord`
- `SkillAssetRecord`

这一层是本轮新增的核心。

它的职责：

- 形成导航结构
- 形成资产结构
- 形成跨层关系
- 承接 probe runtime

### 2.4 Interface Layer：接口层

接口层分两层：

- `DataLayerAPI`
  - 继续暴露当前 `session / memory_unit / source_asset / archive_anchor / mixed`
- `AssetLayerAPI`
  - 新增在其上的资产与记忆树运行时接口

结论：

**`DataLayerAPI` 保持稳定，`AssetLayerAPI` 作为其上的实现级投影层出现。**

---

## 3. 规范化身份与根引用

### 3.1 RootKind

```ts
type RootKind = 'session' | 'repo' | 'scope'
```

### 3.2 内部 RootRefRecord

public tool 输入阶段可以继续把 `root_ref` 当字符串传入，但运行时内部应统一解析为：

```ts
interface RootRefRecord {
  root_kind: RootKind
  root_id: string
  project?: string
  scope_id?: string
}
```

规范：

- `session` 根对应一个会话容器
- `repo` 根对应一个仓库容器
- `scope` 根对应一个视图容器，而不是物理 repo 副本

### 3.3 ID 规范

所有投影对象都必须用显式前缀命名，避免和现有 `memory_unit:* / source_asset:* / archive_anchor:*` 混淆。

建议前缀：

- `tree_node:`
- `product_asset:`
- `memory_asset:`
- `skill_asset:`
- `asset_edge:`

同一对象在所有索引层和图层中必须保持同一个 ID。

---

## 4. TreeNodeRecord：导航节点正式契约

实现层不要直接把每个树节点都等同于资产对象。

建议：

- `TreeNodeRecord` 负责导航
- `AssetRecord` 负责长期复用对象
- 二者通过 `asset_id` 或 `derived_asset_ids` 连接

### 4.1 TreeNodeType

```ts
type TreeNodeType =
  | 'conversation_leaf'
  | 'archive_batch'
  | 'session_milestone'
  | 'session_stage'
  | 'repo_stage'
  | 'workstream'
  | 'repo_milestone'
  | 'product_leaf'
  | 'skill_leaf'
  | 'scope_mount'
  | 'global_milestone'
```

### 4.2 TreeNodeRecord

```ts
type TreeNodeStatus = 'active' | 'superseded' | 'archived'
type PrivacyLevel = 'private' | 'project' | 'shared' | 'public'

interface TreeNodeRecord {
  id: string
  root_kind: RootKind
  root_id: string
  project: string
  scope_id?: string
  node_type: TreeNodeType
  parent_id?: string
  child_ids: string[]
  asset_id?: string
  derived_asset_ids?: string[]
  title: string
  summary: string
  anchor_text?: string
  keywords: string[]
  evidence_refs: string[]
  raw_refs: string[]
  related_node_ids: string[]
  related_asset_ids: string[]
  branch_key?: string
  rank?: number
  budget_weight?: number
  privacy_level: PrivacyLevel
  status: TreeNodeStatus
  created_at: string
  updated_at: string
}
```

### 4.3 节点生成规则

- `conversation_leaf`
  - 优先由 `memory_unit` 投影生成
- `archive_batch`
  - 由一组相邻 `conversation_leaf` 收敛生成
- `session_milestone`
  - 由多个 `archive_batch` 与关键决策提炼生成
- `session_stage`
  - 由多个 `session_milestone` 串成主线
- `workstream`
  - 由 repo 范围内同类 session milestone、commit context、artifact cluster 聚合生成
- `repo_milestone`
  - 由 repo 阶段性结果、约束、决策聚合生成
- `scope_mount`
  - 只表达 repo 与 scope 的挂载关系，不挂 raw

### 4.4 节点与预算的关系

每个节点必须有 `budget_weight` 或可被计算出预算权重，用于：

- 小窗口模型优先停在主线
- 大窗口模型允许展开 branch
- raw hydration 时控制注入比例

---

## 5. BaseAssetRecord：三类资产共享正式字段

本轮不再停留在“建议字段”，而采用共享字段分组。

### 5.1 共享基础字段

```ts
type AssetType = 'product' | 'memory' | 'skill'
type AssetStatus = 'draft' | 'active' | 'superseded' | 'archived'

interface BaseAssetRecord {
  id: string
  asset_type: AssetType
  project: string
  scope_id: string
  title: string
  summary: string
  status: AssetStatus
  privacy_level: PrivacyLevel
  created_at: string
  updated_at: string
}
```

### 5.2 共享索引字段

```ts
interface BaseAssetIndexFields {
  tags: string[]
  keywords: string[]
  search_text: string
  embedding_text: string
}
```

### 5.3 共享关系字段

```ts
interface BaseAssetRelationFields {
  source_refs: string[]
  session_refs: string[]
  commit_refs: string[]
  evidence_refs: string[]
  related_asset_ids: string[]
  related_node_ids: string[]
}
```

### 5.4 共享版本字段

```ts
interface BaseAssetVersionFields {
  version: number
  lineage: string[]
  supersedes: string[]
  snapshot_at?: string
}
```

### 5.5 实现层统一组合

```ts
type AssetRecord =
  BaseAssetRecord
  & BaseAssetIndexFields
  & BaseAssetRelationFields
  & BaseAssetVersionFields
```

---

## 6. 三类资产正式契约

### 6.1 ProductAssetRecord

```ts
interface ProductAssetRecord extends AssetRecord {
  asset_type: 'product'
  product_kind:
    | 'file'
    | 'module'
    | 'api'
    | 'document'
    | 'config'
    | 'dataset'
    | 'release'
    | 'workflow_artifact'
  repo_uri?: string
  repo_path?: string
  branch?: string
  commit_range?: string[]
  artifact_format?: string
  owner_module?: string
  build_state?: 'unknown' | 'draft' | 'ready' | 'released'
}
```

### 6.2 MemoryAssetRecord

```ts
interface MemoryAssetRecord extends AssetRecord {
  asset_type: 'memory'
  memory_kind:
    | 'problem'
    | 'decision'
    | 'constraint'
    | 'preference'
    | 'attempt'
    | 'failure'
    | 'insight'
    | 'milestone'
  root_kind: RootKind
  root_id: string
  node_ref?: string
  anchor_text?: string
  raw_refs: string[]
  parent_memory_id?: string
  child_memory_ids: string[]
  branch_key?: string
  probe_policy?: 'main_only' | 'branch_first' | 'leaf_allowed' | 'raw_required'
}
```

### 6.3 SkillAssetRecord

```ts
interface SkillAssetRecord extends AssetRecord {
  asset_type: 'skill'
  skill_kind:
    | 'method'
    | 'checklist'
    | 'prompt_template'
    | 'workflow_template'
    | 'pattern'
    | 'anti_pattern'
    | 'review_routine'
    | 'debug_routine'
  trigger_conditions: string[]
  prerequisites: string[]
  steps: string[]
  inputs: string[]
  outputs: string[]
  success_signals: string[]
  anti_patterns: string[]
  confidence: number
}
```

### 6.4 关系边正式枚举

```ts
type AssetEdgeType =
  | 'LEADS_TO'
  | 'APPLIES_TO'
  | 'EXTRACTED_FROM'
  | 'EVOLVES_TO'
  | 'DEPENDS_ON'
  | 'EVIDENCED_BY'
  | 'MATERIALIZED_AS'
```

---

## 7. 与当前代码现实的正式映射

### 7.1 当前对象到新层的映射

| 当前对象 | 当前职责 | 新层定位 |
| --- | --- | --- |
| `session` | 会话级容器 | `RootRef(session)` 的事实入口 |
| `memory_unit` | 结构化记忆单元 / document chunk | `conversation_leaf` 的主要素材，也可作为 `MemoryAsset` 证据 |
| `archive_anchor` | 会话或文档锚点 | `archive_batch / session_milestone / repo_milestone` 的主要素材 |
| `source_asset` | 来源载体 | 证据对象，不直接等于 `ProductAsset` |
| `commit_context` | commit 事实与改动上下文 | `ProductAsset / MemoryAsset / SkillAsset` 的版本证据 |

### 7.2 当前 extraction bundle 的定位

当前 `MemoryExtractionBundle` 是：

- deterministic 中间产物
- projection 的输入之一
- graph 同步的 managed source

它不是最终的资产层对象，但可以作为：

- `TreeNodeRecord` 的材料
- `MemoryAssetRecord` 的材料
- `AssetEdgeType.EVIDENCED_BY` 的来源

### 7.3 当前 `DataLayerAPI` 的正式位置

当前 `DataLayerAPI` 继续提供：

- `search`
- `getSession`
- `listSessions`
- `getCommitContext`
- `getEntityGraph`

而新层不应替换它，而应包裹它：

```ts
interface AssetLayerDependencies {
  data_layer: DataLayerAPI
  getTreeNode(id: string): Promise<TreeNodeRecord | null>
  getAsset(id: string): Promise<AssetRecord | null>
  listMainNodes(input: ProbeMainRequest): Promise<TreeNodeRecord[]>
  listBranchNodes(input: ProbeBranchRequest): Promise<TreeNodeRecord[]>
  listLeafNodes(input: ProbeLeafRequest): Promise<TreeNodeRecord[]>
}
```

---

## 8. 存储映射正式分工

### 8.1 Git / Gitea

负责：

- repo 文件
- clean transcript
- manifest
- workflow artifact
- 用户确认需要版本化的资产快照

不负责：

- 高速 recall 查询
- 每次 probe 的运行时状态

### 8.2 `index/search.sqlite`

负责：

- transcript session registry
- 基础 recall 入口
- 当前 `DataLayerAPI` 的 session 级检索支持

### 8.3 vector index

负责：

- `memory_unit`
- `source_asset`
- 后续 `AssetRecord.embedding_text`

### 8.4 graph index

负责：

- session/source/unit/anchor 的 managed graph
- asset edge
- 跨 repo / 跨 scope / 跨 skill 关联

### 8.5 extraction bundle

负责：

- deterministic 抽取快照
- projection 输入
- 可重放、可审计的中间状态

### 8.6 计划新增：`index/asset-layer.sqlite`

建议新增一个 materialized projection 库，至少包含：

- `tree_nodes`
- `assets`
- `asset_edges`
- `root_refs`
- `materialization_runs`

这一层的原则：

- 可重建
- 可局部重算
- 不替代 Git 事实层

---

## 9. 接口 contract

### 9.1 导入接口

```ts
type ImportSourceKind =
  | 'transcript'
  | 'repo_artifact'
  | 'document'
  | 'workflow_artifact'
  | 'manual'

interface AssetImportRequest {
  source_kind: ImportSourceKind
  project: string
  scope_id?: string
  source_uri?: string
  import_ref?: string
  session_id?: string
  commit_refs?: string[]
}

interface AssetImportResult {
  source_asset_id: string
  project: string
  imported_at: string
  manifest_ref?: string
}
```

### 9.2 提炼接口

```ts
type ExtractMode = 'deterministic' | 'structured' | 'llm'

interface AssetExtractRequest {
  project: string
  root_kind: RootKind
  root_id: string
  source_asset_ids?: string[]
  mode: ExtractMode
  force?: boolean
}

interface AssetExtractResult {
  materialization_run_id: string
  tree_node_ids: string[]
  asset_ids: string[]
  edge_ids: string[]
  generated_at: string
}
```

### 9.3 回写接口

```ts
type WritebackMode = 'snapshot' | 'manifest' | 'knowledge_note'

interface AssetWritebackRequest {
  asset_ids: string[]
  target_repo: string
  branch?: string
  mode: WritebackMode
  include_evidence_refs?: boolean
}

interface AssetWritebackResult {
  written_paths: string[]
  commit_refs: string[]
}
```

### 9.4 Probe runtime 接口

```ts
type BudgetProfileId = 'S' | 'M' | 'L' | 'XL' | 'XXL'

interface ProbeMainRequest {
  query: string
  root_ref: string
  budget_profile?: BudgetProfileId
  limit?: number
}

interface ProbeBranchRequest {
  node_id: string
  query?: string
  budget_profile?: BudgetProfileId
  limit?: number
}

interface ProbeLeafRequest {
  node_id: string
  limit?: number
}

interface HydrateRawRequest {
  ref: string
  mode?: 'snippet' | 'full'
  max_chars?: number
}

interface FullSearchRequest {
  query: string
  scope_id?: string
  project?: string
  targets?: Array<'session' | 'memory_unit' | 'source_asset' | 'archive_anchor' | 'asset'>
  limit?: number
}
```

### 9.5 Probe response 契约

```ts
type ProbeStopReason =
  | 'enough_context'
  | 'needs_branch'
  | 'needs_leaf'
  | 'needs_raw'
  | 'budget_limit'
  | 'miss'

interface ProbeResponse {
  nodes: TreeNodeRecord[]
  related_assets: AssetRecord[]
  evidence_refs: string[]
  stop_reason: ProbeStopReason
}
```

### 9.6 AssetLayerAPI

```ts
interface AssetLayerAPI {
  probeMain(input: ProbeMainRequest): Promise<ProbeResponse>
  probeBranch(input: ProbeBranchRequest): Promise<ProbeResponse>
  probeLeaf(input: ProbeLeafRequest): Promise<ProbeResponse>
  hydrateRaw(input: HydrateRawRequest): Promise<string | null>
  fullSearch(input: FullSearchRequest): Promise<ProbeResponse>
  getAsset(id: string): Promise<AssetRecord | null>
  traceLineage(assetId: string): Promise<AssetRecord[]>
}
```

说明：

- `fullSearch` 在资产索引未完全落地前，可以内部回落到当前 `DataLayerAPI.search`
- `probeMain / probeBranch / probeLeaf` 优先走 `tree_nodes`
- `hydrateRaw` 只在必须核对原文时触发

---

## 10. 开源核心边界在实现层的落点

本轮进入开源核心的实现内容：

- `TreeNodeRecord`
- `AssetRecord`
- `AssetLayerAPI`
- import / extract / writeback contract
- asset projection materialization
- FTS / vector / graph / probe 的统一编排

本轮不进入开源核心的内容：

- deer-flow 式完整执行编排
- 重型多 agent UI
- 企业权限、审计、计费
- skill 市场、插件市场
- SaaS 托管层

---

## 11. 第一阶段编码顺序

建议严格按下面的顺序推进：

1. 在 `packages/types` 新增 `TreeNodeRecord / AssetRecord / AssetLayerAPI` 类型
2. 增加 `index/asset-layer.sqlite` 的 materialized schema
3. 先把 transcript bundle 投影成 `conversation_leaf / archive_batch / session_milestone`
4. 在 `DataLayerAPI` 之上实现 `AssetLayerAPI` 的 session 级 probe
5. 再做 repo 级 workstream / repo milestone materialization
6. 最后再加 scope view、global milestone、budget profile 调度

---

## 12. 一句话落地结论

OpenMnemo 的下一步实现，不是直接推翻当前数据层重来，而是：

**保留当前 `DataLayerAPI` 作为底层事实检索面，在其上增加 `TreeNodeRecord + AssetRecord + AssetLayerAPI` 三件套，把创造资产内核真正落成可编码、可投影、可回写的运行时契约。**

---

## 13. 落表级 schema contract

这一节把“实现级契约”再往下压一层，明确哪些字段必须进 SQLite，哪些字段只能作为投影派生结果存在。

### 13.1 通用落表规则

- 所有 ID 都使用显式前缀，避免和当前 `memory_unit:* / source_asset:* / archive_anchor:*` 体系混淆。
- 所有数组字段在 SQLite 中统一存为 JSON 文本，避免为单个字段拆出过多辅助表。
- 所有时间戳统一使用 UTC ISO 8601。
- 所有投影对象都必须携带 `project`，`scope_id` 允许为空，但不能靠隐式上下文推导。
- `root_kind + root_id + project` 是最小稳定定位键。
- 投影表只保存可重建的派生结果，不保存原始 transcript、原始 repo 文件或不可逆压缩产物。

### 13.2 `tree_nodes` 表

`tree_nodes` 负责承载导航结构，核心责任是“让 probe 能走树”，而不是替代资产层。

建议字段：

- `id TEXT PRIMARY KEY`
- `root_kind TEXT NOT NULL`
- `root_id TEXT NOT NULL`
- `project TEXT NOT NULL`
- `scope_id TEXT`
- `node_type TEXT NOT NULL`
- `parent_id TEXT`
- `asset_id TEXT`
- `derived_asset_ids TEXT NOT NULL DEFAULT '[]'`
- `title TEXT NOT NULL`
- `summary TEXT NOT NULL DEFAULT ''`
- `anchor_text TEXT`
- `keywords TEXT NOT NULL DEFAULT '[]'`
- `evidence_refs TEXT NOT NULL DEFAULT '[]'`
- `raw_refs TEXT NOT NULL DEFAULT '[]'`
- `related_node_ids TEXT NOT NULL DEFAULT '[]'`
- `related_asset_ids TEXT NOT NULL DEFAULT '[]'`
- `branch_key TEXT`
- `rank INTEGER`
- `budget_weight REAL`
- `privacy_level TEXT NOT NULL`
- `status TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

建议索引：

- `(root_kind, root_id, parent_id)`
- `(project, scope_id, node_type)`
- `(asset_id)`
- `(status, updated_at)`

约束：

- 根节点的 `parent_id` 必须为空。
- `asset_id` 可空，但一旦存在，必须指向同项目下的资产。
- `scope_mount` 类型只能表达挂载关系，不能携带 raw 事实。
- `budget_weight` 可以为空，但一旦存在必须可用于排序与裁剪。

### 13.3 `assets` 基表

`assets` 负责长期复用对象的公共字段，三个资产子类型都必须先落在这张表里。

建议字段：

- `id TEXT PRIMARY KEY`
- `asset_type TEXT NOT NULL`
- `project TEXT NOT NULL`
- `scope_id TEXT NOT NULL`
- `title TEXT NOT NULL`
- `summary TEXT NOT NULL DEFAULT ''`
- `status TEXT NOT NULL`
- `privacy_level TEXT NOT NULL`
- `version INTEGER NOT NULL DEFAULT 1`
- `lineage TEXT NOT NULL DEFAULT '[]'`
- `supersedes TEXT NOT NULL DEFAULT '[]'`
- `source_refs TEXT NOT NULL DEFAULT '[]'`
- `session_refs TEXT NOT NULL DEFAULT '[]'`
- `commit_refs TEXT NOT NULL DEFAULT '[]'`
- `evidence_refs TEXT NOT NULL DEFAULT '[]'`
- `related_asset_ids TEXT NOT NULL DEFAULT '[]'`
- `related_node_ids TEXT NOT NULL DEFAULT '[]'`
- `tags TEXT NOT NULL DEFAULT '[]'`
- `keywords TEXT NOT NULL DEFAULT '[]'`
- `search_text TEXT NOT NULL DEFAULT ''`
- `embedding_text TEXT NOT NULL DEFAULT ''`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

约束：

- `lineage` 对非 genesis 资产必须可追溯到至少一个前序资产。
- 首次 materialization 产生的 genesis 资产允许 `lineage` 为空，但必须通过 `source_refs` 或 `evidence_refs` 直接锚定事实来源。
- `supersedes` 只描述版本关系，不描述业务依赖。
- `search_text` 面向 FTS，`embedding_text` 面向向量层，二者不可互相替代。

### 13.4 子类型详情表

子类型专有字段建议拆到独立详情表，避免 `assets` 基表膨胀。

#### `product_assets`

- `asset_id TEXT PRIMARY KEY`
- `product_kind TEXT NOT NULL`
- `repo_uri TEXT`
- `repo_path TEXT`
- `branch TEXT`
- `commit_range TEXT NOT NULL DEFAULT '[]'`
- `artifact_format TEXT`
- `owner_module TEXT`
- `build_state TEXT NOT NULL`

#### `memory_assets`

- `asset_id TEXT PRIMARY KEY`
- `memory_kind TEXT NOT NULL`
- `root_kind TEXT NOT NULL`
- `root_id TEXT NOT NULL`
- `node_ref TEXT`
- `anchor_text TEXT`
- `raw_refs TEXT NOT NULL DEFAULT '[]'`
- `parent_memory_id TEXT`
- `child_memory_ids TEXT NOT NULL DEFAULT '[]'`
- `branch_key TEXT`
- `probe_policy TEXT`

#### `skill_assets`

- `asset_id TEXT PRIMARY KEY`
- `skill_kind TEXT NOT NULL`
- `trigger_conditions TEXT NOT NULL DEFAULT '[]'`
- `prerequisites TEXT NOT NULL DEFAULT '[]'`
- `steps TEXT NOT NULL DEFAULT '[]'`
- `inputs TEXT NOT NULL DEFAULT '[]'`
- `outputs TEXT NOT NULL DEFAULT '[]'`
- `success_signals TEXT NOT NULL DEFAULT '[]'`
- `anti_patterns TEXT NOT NULL DEFAULT '[]'`
- `confidence REAL NOT NULL DEFAULT 0`

### 13.5 `asset_edges` 表

`asset_edges` 负责长期复用关系，不负责树形导航。

边 ID 必须可重复生成，推荐规则为稳定内容哈希前缀，例如：

- `asset_edge:<hash(from_asset_id,to_asset_id,edge_type,project,scope_id,evidence_refs)>`

建议字段：

- `id TEXT PRIMARY KEY`
- `from_asset_id TEXT NOT NULL`
- `to_asset_id TEXT NOT NULL`
- `edge_type TEXT NOT NULL`
- `project TEXT NOT NULL`
- `scope_id TEXT`
- `evidence_refs TEXT NOT NULL DEFAULT '[]'`
- `weight REAL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

建议边类型继续沿用：

- `LEADS_TO`
- `APPLIES_TO`
- `EXTRACTED_FROM`
- `EVOLVES_TO`
- `DEPENDS_ON`
- `EVIDENCED_BY`
- `MATERIALIZED_AS`

### 13.6 `root_refs` 与 `materialization_runs`

`root_refs` 用来保存“某个根当前投影到了哪里”，`materialization_runs` 用来记录一次投影的输入、输出与状态。

`root_refs` 必须按 `root_kind + root_id + scope_id + projection_version` 保持单行幂等 upsert；建议对该组合加唯一约束。

#### `root_refs`

- `id TEXT PRIMARY KEY`
- `root_kind TEXT NOT NULL`
- `root_id TEXT NOT NULL`
- `project TEXT NOT NULL`
- `scope_id TEXT`
- `projection_version TEXT NOT NULL`
- `head_node_id TEXT`
- `head_asset_id TEXT`
- `materialization_run_id TEXT`
- `privacy_level TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

建议唯一约束：

- `(root_kind, root_id, scope_id, projection_version)`

建议 `id` 生成规则：

- `root_ref:<projection_version>:<root_kind>:<root_id>:<scope_id|global>`

#### `materialization_runs`

- `id TEXT PRIMARY KEY`
- `projection_version TEXT NOT NULL`
- `root_kind TEXT NOT NULL`
- `root_id TEXT NOT NULL`
- `project TEXT NOT NULL`
- `scope_id TEXT`
- `input_source_refs TEXT NOT NULL DEFAULT '[]'`
- `input_asset_ids TEXT NOT NULL DEFAULT '[]'`
- `status TEXT NOT NULL`
- `error_message TEXT`
- `started_at TEXT NOT NULL`
- `finished_at TEXT`

约束：

- 同一个 `root_kind + root_id + projection_version` 的重复 materialization 必须幂等。
- `root_refs` 不靠“最新一条”语义猜测当前头，而是靠唯一键幂等 upsert 直接定位当前视图头。
- `materialization_runs` 只追加，不回写历史。

---

## 14. Probe / runtime contract 补充

这一节把 probe 的停止条件、回退策略和兼容语义说得更硬一点，避免实现时各层各说各话。

### 14.1 `probeMain`

- 输入必须先解析成 `RootRefRecord`。
- `probeMain` 优先读 `tree_nodes`，再补 `assets`，最后才回退到底层 `DataLayerAPI.search`。
- 它返回的是“足够上下文”，不是“尽可能多上下文”。
- 一旦已经命中主线、分支和足够证据，就必须停。

### 14.2 `probeBranch`

- 只展开指定节点下的局部上下文。
- 允许带 `query`，但不能绕过父节点约束。
- 对 `budget_profile` 的响应优先级高于对局部召回分数的追求。

### 14.3 `probeLeaf`

- 只返回叶子和叶子直接相关的证据。
- 不主动拉高到更大的主线节点。
- 如果叶子本身已经足够说明问题，就不再继续展开。

### 14.4 `hydrateRaw`

- 只在需要核对原文、原文件或原始 transcript 时触发。
- 如果权限、scope 或证据不存在，返回 `null`，不伪造内容。
- `hydrateRaw` 不是普通检索接口，它是最后一层回填接口。

### 14.5 兼容语义

- `DataLayerAPI` 继续作为稳定底层事实面，不做破坏性改名。
- `AssetLayerAPI` 优先作为 `DataLayerAPI` 之上的投影层出现。
- 当资产层缺数据时，可以回退到 `DataLayerAPI.search`，但不能把回退结果当成资产层真相。

### 14.6 失败语义

建议后续统一至少区分这些错误面：

- `INVALID_ROOT_REF`
- `NOT_FOUND`
- `PROJECTION_STALE`
- `RAW_BLOCKED`
- `BUDGET_EXCEEDED`
- `NO_EVIDENCE`

---

## 15. 第一版实现切片建议

如果要把这份契约直接转成代码，建议再切细一点：

1. 先在 `packages/types` 里把 `TreeNodeRecord / AssetRecord / AssetLayerAPI` 定下来。
2. 再落 `index/asset-layer.sqlite` 的基础表和幂等约束。
3. 先做 session 级 projection，把 transcript bundle 稳定投影成 `conversation_leaf / archive_batch / session_milestone`。
4. 再在 `DataLayerAPI` 上挂第一版 `AssetLayerAPI`。
5. 最后再扩到 repo 级和 global 级视图。
