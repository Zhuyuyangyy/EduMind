# EduMind 账号数据存储清单（P4-2B-1）

> 基线：`116a186`（P4-2B-2b 之后）· 分支 `feat/mobile-v1` · main 冻结 `353a01a`
>
> 用途：P4-2B 数据持久化改造的盘点底表。所有「权威来源」判定以代码为准
> （`server/` 各模块），JSON 默认路径按各模块实际取值列出——**不同模块的
> JSON 默认路径不一致，不得假设只有一个 store.json**。

## 一、数据对象总表（六列）

| # | 数据对象 | 权威来源（生产） | JSON 开发路径（默认值） | 账号隔离 | 并发/跨进程 | 重启/故障行为 | 迁移/备份/回滚 |
|---|---|---|---|---|---|---|---|
| 1 | 认证身份 identities | MySQL `identities` 表 | `ZHIXUE_IDENTITY_FILE` 或 `<cwd>/server/identities.json` | 主键 account_id | MySQL 唯一约束；JSON 单文件无跨进程锁 | 重启保留（MySQL/文件持久）；存储不可达 fail-closed 拒认证 | 由 identity.js 双实现；迁移随 B-4 显式命令 |
| 2 | 会话 auth_sessions | MySQL `auth_sessions` 表 | `ZHIXUE_SESSION_FILE` 或 `<cwd>/server/sessions.json` | 行级 account_id 字段 | MySQL 唯一约束 + 撤销时间戳；JSON 无跨进程撤销传播 | 重启后未过期会话仍有效（设计语义）； revoked 立即失效 | 服务端重启不失效（区别于纯内存会话）；备份=库快照 |
| 3 | 用户画像 profile_result | MySQL `profile_results` 表 | **`store/mysql.js` 的 `profiles` 映射**（`ZHIXUE_DATA_FILE` 或 `<repo>/store.json`；`data.js` 的 `getLatestProfileResult/saveProfileResult` 仅转发到它——`data.js` 的 `profileResult` 字段是旧遗留，无读写路径，B-4 不得依据它导入） | 账号映射键 | MySQL upsert；JSON 整文件读改写（同账号并发可能互相覆盖） | 重启保留；文件损坏回退默认（**可能丢历史**，见风险 R1） | B-4 迁移命令（迁 `profiles` 映射）；备份=文件/库快照 |
| 4 | 账号设置 account_settings | MySQL `account_settings` 表 | `store/mysql.js` fallback → `ZHIXUE_DATA_FILE` 或 `<root>/store.json` 的 `accountSettings` | 账号映射键 | 同上（仅展示名，影响低） | 重启保留 | 随 B-4 |
| 5 | 智能体协作记录 agent_collaboration | MySQL `agent_collaboration` 表 | `store/mysql.js` fallback → `ZHIXUE_DATA_FILE` 或 `<root>/store.json` 的 `agentCollaboration` | 账号映射键 | 同上 | 重启保留 | 随 B-4；含 seed 演示数据（**非真实用户数据，迁移时跳过**） |
| 6 | 学习闭环记录 learning_cycles | MySQL `learning_cycles` 表 | `store/mysql.js` fallback → 同上 `learningCycles` | 账号映射键 | MySQL 事务；JSON 无 | 重启保留 | 随 B-4 |
| 7 | 学习会话/作答/事件/统计/画像修订 | MySQL `study_sessions` / `answer_submissions` / `learning_events` / `profile_revisions` | `study/store.js` → `ZHIXUE_DATA_FILE` 或 `<cwd>/data/store.json` | 记录带 account_id；查询按账号过滤 | MySQL：会话/作答唯一约束、事件/修订按账号查询；**JSON 无跨进程 CAS** | 重启保留；DB 故障时 JSON 模式不适用（生产仅 MySQL） | P3 已迁 MySQL；JSON 为开发态；修订账本有 session 唯一约束 |
| 8 | 知识路径（P4-2B-2） | MySQL `knowledge_paths` + `knowledge_path_ledger` | `data.js` store.json 的 `knowledgePathByAccount` | 主键 account_id | **版本 CAS + 会话账本（事务）**；并发更新不丢（v5→v6→v7 实测） | 重启保留；DB 故障明确报错，不静默写 JSON | 已有 CAS 契约；B-4 需补旧 JSON 导入（禁止覆盖较新版本） |
| 9 | 聊天历史（P4-2B-3） | MySQL `chat_messages` | `data.js` store.json 的 `chatHistory`（账号映射） | 主键/索引 account_id | **交互原子事务 + 自增 seq 稳定排序**；账号索引查询 | 重启保留；DB 故障请求失败（不假装成功） | B-4 需补导入（两种旧结构：全局数组→default、账号映射） |
| 10 | 导师辅导历史（P4-2B-3） | MySQL `tutoring_history` | `data.js` store.json 的 `tutoringHistory`（账号映射） | 索引 account_id | 账号索引查询；30/20 展示契约 | 重启保留；DB 故障请求失败 | B-4 需补导入；fallbackAgents 三态保留 |
| 11 | 用户偏好（学习偏好设置） | 当前为**前端 localStorage 示例占位**（复审发现：界面仍是示例数据） | 无服务端持久化 | — | — | — | **待建设**：P4-2B 之后单独排期（不入本轮迁移范围） |
| 12 | AI 追踪/证据记录 | JSON `evidence-data/traces.json`（`ZHIXUE_TRACE_FILE`） | 同左（唯一存储） | **逻辑账号隔离**（`recorder.js` 经 AsyncLocalStorage + `accountId` 过滤，无 accountId 的旧 trace 归 `default`）；但**物理上所有账号共享同一 JSON 文件** | 全局最近 200 条保留；并发 read-modify-write 可能互相覆盖；无跨进程保证 | 重启从文件重读；**超 200 条滚动丢弃**（可能丢业务证据）；P4-2B-3a 起写入失败不影响业务响应（非关键诊断数据） | **P4-2B-6 决策项**：区分业务证据与临时追踪后决定是否入库；当前不迁 |
| 13 | 静态内容：resources / recommended / learning-path / evaluation / tutoring-topics / 题库 bank | 随包 JSON 文件（`server/*.json`、`server/study/exercise-bank.json`） | 同左（只读模板） | 不适用（全局模板） | 只读 | 随部署版本 | **演示模板/内容数据，不属于账号数据，迁移时不得混入** |

## 二、按数据性质分类（迁移时防混淆）

| 类别 | 对象 | 迁移策略 |
|---|---|---|
| 真实用户学习数据 | #1–#10 | B-4 显式迁移命令（dry-run/backup/import/verify/重复导入幂等）；归属不明的旧记录单独标记，不猜测归属 |
| 演示模板/种子数据 | #13、agent_collaboration 的 seed | 不迁移；重建环境时由 seed 逻辑重新生成 |
| 审计/运行追踪 | #12 | P4-2B-6 出决策（TTL 清理 vs 入库 vs 外部日志）；脱敏要求见该文档 |
| 缓存/占位 | #11 学习偏好 | 不迁移；产品化前建设 |

## 三、JSON 默认路径清单（互不相同，逐一核对）

| 模块 | 环境变量 | 默认路径 |
|---|---|---|
| `server/data.js`（画像/路径/聊天/辅导） | `ZHIXUE_CHAT_STORE_FILE` | `server/store.json` |
| `server/store/mysql.js` fallback（画像/设置/协作/闭环） | `ZHIXUE_DATA_FILE` | `<repo>/store.json` |
| `server/study/store.js`（会话/作答/事件/修订） | `ZHIXUE_DATA_FILE` | `<cwd>/data/store.json` |
| `server/identity.js` | `ZHIXUE_IDENTITY_FILE` | `<cwd>/server/identities.json` |
| `server/auth.js` | `ZHIXUE_SESSION_FILE` | `<cwd>/server/sessions.json` |
| `server/evidence/recorder.js` | `ZHIXUE_TRACE_FILE` | `evidence-data/traces.json` |

> 测试环境统一把 `ZHIXUE_DATA_FILE` 与 `ZHIXUE_CHAT_STORE_FILE` 指向同一
> 临时文件，因此测试里看不到路径分歧；生产默认值下 `data.js` 与
> `store/mysql.js` 的 JSON 落点是两个不同文件——B-4 迁移必须逐模块取
> 真实路径，不能只搬一个 store.json。

## 四、本轮发现的风险与缺口（移交 B-4/B-6）

- **R1（中）**：`data.js` 的 `readStore` 在 JSON 解析失败时回退默认存储，
  文件损坏会静默丢失全部历史。生产模式仅走 MySQL，风险限于开发态；
  B-4 迁移前应先备份。
- **R2（中）**：画像/设置/协作/闭环的 JSON fallback 是整文件读改写，
  同账号并发更新互相覆盖。生产仅 MySQL（upsert/事务），JSON 仅开发态。
- **R3（高，P4-2B-6 处理）**：AI 追踪虽有逻辑账号隔离（读取按账号
  过滤），但物理共享单文件、全局 200 条滚动丢弃、并发写可能覆盖，
  可能丢失业务证据；含学习内容需脱敏。
- **R4（低）**：学习偏好无服务端持久化（前端占位）。
- **R5（信息）**：`knowledge_paths`/`chat_messages`/`tutoring_history` 为
  P4-2B 新增表，旧 JSON 数据的导入在 B-4 统一实现；导入必须保留账号归属、
  禁止覆盖较新版本、重复导入幂等。

## 五、验收口径

B-4 迁移命令与 B-5 跨实例门禁以本清单为对账基准：每行数据的数量、账号
归属、关键字段与顺序在 dry-run / import / verify 三阶段逐项核对。
