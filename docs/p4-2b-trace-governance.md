# EduMind AI 追踪治理决策（P4-2B-6）

> 基线：`255a665`（B-5 之后）· 分支 `feat/mobile-v1` · 本文随 B-6 实现提交

## 一、字段审计：trace 数据三分法

| 分类 | 字段 | 判定 | 处理 |
|---|---|---|---|
| 业务权威记录 | 辅导回答全文、聊天消息、评分 | **不在 trace**——权威源是 `tutoring_history` / `chat_messages` / `answer_submissions` 表 | 教学证据不得依赖 trace；trace 丢失不影响业务数据 |
| 诊断元数据（非敏感） | `agents` / `riskFlags` / `fallbackUsed` / `fallbackAgents` / `durationMs` / `confidence` / `securityRefused` / `timestamp` / `accountId` | 诊断与审计必需，不含个人内容 | 原样保留 |
| 敏感学习内容 | `inputsSummary` / `outputsSummary` 顶层摘要；`agentResults[].inputSummary` / `outputSummary` | 曾含原始问题/回答前 80 字符——**个人学习内容** | **默认脱敏**为 `内容(N字，已脱敏)`；调试显式 opt-in 才保留原文 |

判定依据：trace 用于证据页展示与降级审计，是**非关键诊断数据**（B-3a 已确立：其写入失败不影响业务响应）。原始问题/回答已在业务表权威留存，trace 再存一份原文属于重复且扩大隐私面。

## 二、实现（server/evidence/recorder.js）

1. **默认脱敏**（`sanitizeTrace`）：`inputsSummary` / `outputsSummary` 及 `agentResults` 的输入输出摘要，落库前替换为长度摘要。`ZHIXUE_TRACE_KEEP_CONTENT=1` 时显式保留原文（本地调试用，生产不设）。
2. **保留期限**：`TRACE_RETENTION_DAYS = 14`——读取统一入口按 `timestamp` 过滤，超期记录在下次读写时清理（替代旧的全局 200 条滚动）。
3. **每账号上限**：`TRACE_PER_ACCOUNT_LIMIT = 100`——从新到旧遍历，每账号保留最近 100 条；**一个账号写满不再挤占其他账号**（旧全局 200 条的缺陷：活跃账号可把他人 trace 全部挤掉）。
4. **账号隔离**：既有 `AsyncLocalStorage + accountId` 过滤保留，`readTracesForAccount` 门禁验证（trace-governance.test.mjs #3）。

## 三、多实例行为评估

- **现状**：单 JSON 文件（`evidence-data/traces.json`）read-modify-write。多 API 实例并发写会互相覆盖（后写者基于旧全量覆写）——trace 可能丢失部分记录。
- **影响评估**：trace 是非关键诊断数据（B-3a 判定），丢失不影响业务数据与教学证据；但证据页展示可能不完整。
- **处置**：本轮不为非关键诊断数据新建存储平台（任务书允许）。多实例生产部署时按以下优先级演进：
  1. 短期：接受 trace 不完整（诊断降级），关键证据走业务表；
  2. 中期：trace 写改追加语义（append-only JSONL）或按账号分文件，消除覆盖；
  3. 长期：若证据页成为核心功能，迁 MySQL `trace_records` 表或集中日志系统。
- **关键约束（已满足）**：关键教学证据**不得**依赖会滚动丢弃/被覆盖的 trace 文件作为唯一权威来源——权威源始终是业务表。

## 四、门禁（server/trace-governance.test.mjs，先写后修 4/5 红 → 5/5 绿）

1. 默认脱敏：原始问题/回答文本不落 trace（顶层 + agentResults），诊断元数据保留
2. 调试开关：`ZHIXUE_TRACE_KEEP_CONTENT=1` 显式保留原文
3. 账号隔离：A/B 的 trace 互不可见
4. 每账号上限：单账号 150 条写入后 ≤100 且最旧被删、最新保留；其他账号 5 条不受影响
5. 保留期限：60 天前的记录被清理，新记录保留

## 五、遗留与后续

- 脱敏后证据页展示的是长度摘要而非原文——如需原文展示，应从业务表读取（tutoring_history），这是正确方向（权威源展示）。
- 旧 trace 文件中的历史原文记录：保留期 14 天会自然清除；如需立即清除可手动删除 `evidence-data/traces.json`（非业务数据）。
- 生产环境建议设置 `ZHIXUE_TRACE_FILE` 到可写目录并纳入日志轮转策略。

---

## 六、审计补强（P4-2B 最终审计整改 · 基线 6e76273）

独立审计指出三处缺口，已全部关闭（门禁 trace-governance.test.mjs 8/8）：

1. **自由文本字段脱敏**（原只脱敏 inputsSummary/outputsSummary/agentResults 摘要）：
   `sanitizeTrace` 现同时最小化 `evidence`、`riskFlags`、`agentResults[].evidence`、
   `agentResults[].riskFlags`——模型生成的证据文字常引用用户原问题，属同类风险。
   脱敏保留条目数（只替换文本为长度摘要），诊断价值不受损。
   门禁：含独特敏感标记的 evidence/riskFlags 写入后，trace 文件中不存在该标记。

2. **保留期物理清理**（原仅读取过滤）：`readTraces` 检测到超期/超限记录时立即
   写回磁盘（物理删除），不只是查询结果过滤——过期原文不会长期留在文件里。
   门禁：直接写入 30 天前的记录，一次读取后该记录从磁盘消失。

3. **生产模式禁用原文开关**：`keepContent()` 增加生产环境判定
   （ZHIXUE_ENV=production / NODE_ENV=production）——生产环境下即使显式设置
   ZHIXUE_TRACE_KEEP_CONTENT=1 也强制脱敏，原文调试开关不得在生产保留个人
   学习内容。门禁：生产模式 + 开关开启 → 仍脱敏。

**历史 trace 清理策略**（不随意清空不明归属文件）：
- 定位：`evidence-data/traces.json`（或 ZHIXUE_TRACE_FILE）。
- 识别：读取路径按 14 天 TTL + 每账号 100 条自动物理清理——历史含原文的旧记录
  会在自然读写中逐出；无需人工介入。
- 如需立即清除：停止服务 → 备份原文件（sha256 记录）→ 删除或置空
  `evidence-data/traces.json` → 重启。该文件是非关键诊断数据，删除不影响业务。
- 备份目录：`.workbuddy-backups/`（不提交 Git）。
