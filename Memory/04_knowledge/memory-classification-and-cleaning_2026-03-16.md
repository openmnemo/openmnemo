# 记忆分类与聊天清洗规则

## 目的

这份文档用于定义一套适合长期使用的个人记忆资产分类法，以及 transcript 清洗逻辑。

目标不是只服务一个短期项目，而是为未来几十年的个人数字资产管理做基础设计。

本轮结论有两个前提：

1. transcript 按工具分层，不按模型分层。
2. 目录负责粗分类，索引负责精检索。


## 一、分类总原则

不要试图把所有维度都塞进目录层级里。

目录应该只承载最稳定、最不容易变的维度：

1. 这个记忆属于哪个范围
2. 这个记忆属于哪个项目
3. 这个记忆是什么类型
4. 这个记忆来自哪个工具
5. 这个记忆发生在什么时间段

而这些变化快、组合多、后续可能扩展的维度，更适合放在元数据和索引里：

1. branch
2. tags
3. topic
4. people
5. importance
6. sensitivity
7. workflow phase


## 二、建议的分类维度

建议整个系统统一使用以下维度。

### 1. scope

表示记忆归属范围。

- `global`
- `project`
- `cross-project`
- 后续可扩展 `personal`

### 2. asset_type

表示记忆类型。

- `transcript`
- `goal`
- `todo`
- `chat-log`
- `knowledge`
- `decision`
- `archive`
- `summary`

### 3. source

表示来源工具。

- `codex`
- `claude`
- `gemini`

### 4. derivation

表示这是原始材料、清洗结果还是索引材料。

- `raw`
- `clean`
- `manifest`
- `summary`
- `index`

### 5. time

时间维度建议按长期资产思路设计，而不是只按单次会话。

- `decade`
- `year`
- `month`


## 三、总记忆的分类方式

总记忆是个人数字资产的总账。

总记忆目录建议按下面这个顺序分类：

1. 先按项目
2. 再按记忆类型
3. transcript 再按 `raw/clean/manifests`
4. transcript 再按工具
5. 最后按时间

推荐结构：

```text
memorytree-vault/
  projects/
    openmnemo/
      transcripts/
        raw/
          codex/2020s/2026/03/
          claude/2020s/2026/03/
          gemini/2020s/2026/03/
        clean/
          codex/2020s/2026/03/
          claude/2020s/2026/03/
          gemini/2020s/2026/03/
        manifests/
          codex/2020s/2026/03/
          claude/2020s/2026/03/
          gemini/2020s/2026/03/
      memory/
        active/
          goals/
          todos/
          chat-logs/
          knowledge/
          decisions/
        archive/
          2020s/
            2026/
      summaries/
        yearly/
          2026.md
        decade/
          2020s.md
    another-project/
      ...
  cross-project/
  catalog/
    sessions.jsonl
```


## 四、项目记忆的分类方式

项目记忆不是总账，而是项目视图。

因此项目内的分类不应该过细，重点应该是把“活跃内容”和“历史内容”分开。

建议项目视图里至少有两层：

1. `active`
2. `archive`

推荐结构：

```text
Memory/
  01_active/
    goals/
    todos/
    chat-logs/
    knowledge/
    decisions/
  02_archive/
    2020s/
      2026/
      2027/
  03_transcripts/
    raw/
      codex/2020s/2026/03/
      claude/2020s/2026/03/
      gemini/2020s/2026/03/
    clean/
      codex/2020s/2026/03/
      claude/2020s/2026/03/
      gemini/2020s/2026/03/
    manifests/
      codex/2020s/2026/03/
      claude/2020s/2026/03/
      gemini/2020s/2026/03/
  04_summaries/
    yearly/
      2026.md
    decade/
      2020s.md
```

如果为了兼容当前 skill 的目录，不想立刻调整成 `01_active/02_archive/03_transcripts`，也可以保留现有布局：

- `01_goals`
- `02_todos`
- `03_chat_logs`
- `04_knowledge`
- `05_archive`
- `06_transcripts`

但建议把“十年 / 年 / 月”的概念逐步放进：

- `05_archive`
- `06_transcripts`
- `summaries`


## 五、时间维度怎么设计

时间不能只靠文件名上的日期解决。

对几十年的记忆资产来说，建议同时保留两种时间：

### 1. event_time

这是记忆真正发生的时间。

例如：

- transcript 的 `started_at`
- goal 的创建或生效时间
- decision 的确认时间

目录主分类建议优先使用 `event_time`。

### 2. ingest_time

这是记忆进入系统的时间。

它适合用于：

- 审计
- 回放
- 排查

但不适合作为主目录分类依据。

### 3. 时间目录建议

对于长期资产，建议使用：

```text
2020s/2026/03/
```

也就是：

1. 十年
2. 年
3. 月

这样几十年后结构仍然稳定，不会失控。


## 六、哪些信息不应该做主目录

以下信息很重要，但不建议作为主目录层级：

### 1. branch

原因：

1. branch 变化太快
2. 同一个项目可能有大量临时分支
3. 如果目录按 branch 展开，很快会爆炸
4. 同一条长期记忆不一定只属于一个 branch

branch 更适合放在：

- manifest
- metadata
- search index

### 2. topic / tag

topic 和 tag 更适合做索引字段，而不是目录字段。

### 3. importance / sensitivity

这些适合做策略标签，不适合变成目录树的一部分。


## 七、聊天记录的清洗逻辑

transcript 不应该只有一种形态，而应该分成三个层次。

### 1. raw

这是权威原件。

特点：

1. 保持原样
2. 不做人为改写
3. 用于审计和追溯
4. 当 clean 有歧义时，以 raw 为准

### 2. clean

这是清洗后的可阅读文本。

特点：

1. 适合搜索
2. 适合向量化
3. 适合人工阅读
4. 不是原始证据，只是整理后的表达

### 3. manifest

这是结构化元数据。

manifest 应至少包含：

1. `project`
2. `client`
3. `session_id`
4. `started_at`
5. `imported_at`
6. `cwd`
7. `branch`
8. `raw_sha256`
9. `raw_source_path`
10. `message_count`
11. `tool_event_count`
12. `raw_upload_permission`


## 八、clean transcript 应该怎么清洗

clean 不是“总结”，而是“清理噪音后的可读 transcript”。

### 应保留的内容

1. 用户消息
2. 助手消息
3. 关键工具调用摘要
4. 与任务推进相关的关键中间结论
5. 时间、项目、工具、分支等核心元数据

### 应弱化或折叠的内容

1. 重复的元数据壳
2. 低价值的队列事件
3. 大量重复的工具调度噪音
4. 超长、低信号的工具日志
5. 对后续理解没有帮助的机械性输出

### 不应做的事情

1. 不要把 clean 改写成“模型总结”
2. 不要为了好看而丢掉关键技术过程
3. 不要让 clean 替代 raw
4. 不要在 clean 里制造不存在的结论


## 九、什么最适合做向量化

向量化不应该直接把所有原始内容一股脑塞进去。

建议分层：

### 优先向量化

1. `clean transcripts`
2. `knowledge`
3. `decisions`
4. `yearly summaries`
5. `decade summaries`

### 次级向量化

1. `chat-logs`
2. `goals`
3. `todos`

### 不建议直接做主向量源

1. `raw transcripts`
2. 二进制缓存
3. 纯噪音工具输出

raw 更适合作为追溯证据，而不是主检索源。


## 十、长期资产必须有汇总层

如果系统只保存碎片，而没有年度和十年汇总，那它仍然很难成为真正的长期资产系统。

因此建议强制保留两个汇总层：

### 1. yearly summary

每年一份。

作用：

1. 汇总这一年主要项目
2. 汇总关键决策
3. 汇总重要聊天主题
4. 作为年级别入口

### 2. decade summary

每十年一份。

作用：

1. 压缩长期历史
2. 形成真正的长期记忆骨架
3. 避免几十年后只剩碎片


## 十一、最终建议

后续设计应坚持以下规则：

1. 一切 transcript 都应同时有 `raw`、`clean`、`manifest` 三层。
2. 目录只承载稳定维度：`project -> asset_type -> source -> time`。
3. `branch`、`topic`、`tag` 等进入元数据和索引，不进入主目录。
4. 时间按 `decade/year/month` 组织，而不是只靠文件名日期。
5. 每个项目都应区分 `active` 和 `archive`。
6. 每年和每十年都要生成汇总文档。

一句话概括：

```text
目录负责长期稳定分类，manifest 负责结构化元数据，clean 负责阅读和检索，raw 负责证据与追溯。
```
