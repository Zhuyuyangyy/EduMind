# AstriPath / EduMind Round 1 基线审计

审计分支：`codex/audit-round1`（基于 `feat/mobile-v1`，未修改或合并 `main`）

范围：Vue 3 + TypeScript 前端、Node.js HTTP API、JSON/MySQL 双存储、会话认证、多 Agent 调度、环境配置。支付、App 新功能和架构重写不在本轮范围内。

## 结论

当前认证门禁已经集中在 `server/index.js`：除健康检查、LLM 状态和认证入口外，`/api/*` 需要服务端会话；业务层通过 `accountIdOf(req)` 取账号。会话 token 以哈希持久化，Cookie 写操作有 CSRF 双提交，Bearer 请求走独立通道。聊天、辅导、知识路径、画像、学习闭环和学习会话的读写路径已经按账号传递。

本轮仍发现一个真实的输入边界缺口和一个生产数据边界缺口：资源生成请求原先可以用空对象进入本地 fallback；固定的演示评估、学习路径和工作流原先在生产模式也可由已认证用户读取。两者已在本分支修复并加入回归覆盖。

## 路由与认证审计

### 路由清单（基线）

- 公开：`GET /api/health`、`GET /api/llm/status`、`POST /api/auth/login`、`GET /api/auth/session`、`POST /api/auth/logout`。
- 账号设置：`GET/POST /api/account/settings`。
- Agent 与资源：`/api/agents/*`、`POST /api/resources/generate`。
- 学习数据：`/api/profile/*`、`/api/knowledge-path/*`、`/api/learning-cycles/*`、`/api/study/*`。
- 历史与证据：`/api/chat/*`、`/api/tutoring/*`、`/api/evidence/*`。
- 管理员写操作：`POST /api/agent-collaboration/seed`，服务端检查 `req.session.role === 'admin'`。

`/api/resources/generate` 在 `server/index.js` 中只有一个精确路由分支（没有更早的同路径分支）。本轮把校验放在该分支调用 `runResourceGeneration` 之前，避免未来新增分支或 fallback 绕过校验。

### 认证与权限结论

- 登录角色不由客户端 `role` 决定；正式身份由 `server/identity.js` 查找，演示账号只在非生产模式启用。
- `accountId` 查询参数和请求体字段仍被前端若干调用保留，但服务端业务代码不读取它们，统一使用 `accountIdOf(req)`；因此当前不能通过伪造 `accountId` 读取其他账号数据。
- `server/auth.js` 的 JSON 会话文件和 MySQL `auth_sessions` 都只存 token 哈希；存储不可达时认证 fail-closed。
- 生产模式缺少正式身份存储时不会退化到默认演示账号；默认演示密码只在 demo/development 路径可用。

## 模拟数据、硬编码数据与 fallback 清单

### 明确的演示/固定接口数据

- `server/content/evaluation.json`：固定 `128h`、`82%`、`68%` 等统计和固定阶段证据。
- `server/content/learning-path.json`：固定 mastery 百分比和推荐节点。
- `server/data.js:getAgentWorkflow()`：固定 `wf-demo-001`、时间戳、智能体置信度与输出摘要。
- `server/data.js:generateResourcesPayload()`、`getEvidenceTraces()`、`getEvidenceSummary()`：固定示例资源和证据摘要；其中当前路由主要使用动态 Agent/recorder 结果，仍需后续清理未使用的旧演示函数。
- `server/data/demo-*.fixture.json`：测试/演示夹具，不应作为生产数据源。

### Agent fallback 与默认数值

- `server/agents/profile-agent.js`：缺少 LLM 结果时按答案和默认值计算画像，仍会产生 `totalScore`。
- `server/agents/evaluation-agent.js`、`path-agent.js`、`reflection-agent.js`、`resource-agent.js`、`tutor-agent.js`、`knowledge-path-agent.js`：本地规则 fallback；返回体已经带 `fallbackUsed` 或 `fallbackAgents`，客户端历史也保存降级来源。
- `server/agents/orchestrator.js`：部分调用存在 `63`、`50`、`60` 等 fallback 默认分数/路径输入；这些应继续保持“降级结果”语义，不能作为真实学习效果展示。
- `src/composables/useEvaluationTreeData.ts`、`src/components/agent-map/store/agentMapStore.ts`、`src/components/admin/Hub3DScene.vue`、`src/components/admin/AdminBigScreen.vue` 等使用 `Math.random()` 生成可视化粒子、动画指标或演示状态。它们不是学习成绩，但其中模拟运营指标需在产品化时改为明确的 demo 状态。
- `src/data/edu-mind-course-data.ts`、部分 `src/data/*`：硬编码课程进度和 mastery，属于客户端演示内容，不是用户持久化进度。

本轮没有删除多 Agent 或 fallback，以免破坏竞赛演示；生产模式现在直接拒绝固定评估、学习路径和工作流接口，避免把这些内容当作真实学习效果。

## 风险分级

### P0

- 暂未发现当前分支可直接利用的跨账号读写或管理员越权路径。会话、CSRF、角色和账号归属均有服务端门禁，并已有对应回归测试。

### P1

- **生产固定结果边界（本轮修复）**：`/api/learning-path`、`/api/evaluation`、`/api/agent/workflow` 原先返回固定演示结果；现在生产模式返回 `503 demo-data-disabled`，demo 模式保持兼容。
- **资源生成输入边界（本轮修复）**：`/api/resources/generate` 原先允许空对象进入 fallback；现在要求 `topic` 和 `resourceType` 为有限长度字符串，错误在 agent/fallback 前返回 `400`。
- **持久化默认 JSON fallback**：未配置 `MYSQL_*` 时多个模块写入 JSON 文件。该模式适合本地演示，不适合多实例生产；下一轮应强制生产使用 MySQL 并在启动/健康检查中暴露配置缺失。
- **会话文件默认落盘**：非 MySQL 模式的会话存储是本地 JSON 文件；多实例共享和权限/备份策略需要下一轮明确。

### P2

- 客户端仍发送冗余 `accountId` 字段，容易误导后续开发者；下一轮统一删除或改名为仅 UI 展示字段，并保留服务端拒绝/忽略测试。
- 演示资源、课程进度、随机可视化指标与静态管理员大屏需要统一 `dataSource: demo-fixture` 标记和 UI 提示。
- 未使用的旧演示函数和静态夹具会增加误接生产的概率，应在下一轮分离到 `fixtures/` 或删除死代码。

## 本轮修改

1. `server/schemas.js`：增强 `validateResourceGenerateInput`，检查对象、`topic`/`resourceType` 类型、非空和长度上限。
2. `server/index.js`：在唯一 `/api/resources/generate` 分支先校验再调用 Agent；生产模式拒绝三个固定演示结果接口。
3. `server/resource-generate-validation.test.mjs`：覆盖空请求、错误类型和合法请求，验证校验发生在 fallback 前。

### Review Follow-up：前端评估数据边界

此前审计遗漏了前端评估页的第二条数据路径：`src/composables/useEvaluationTreeData.ts` 在请求失败后仍会调用 `createMockData()`，而 `src/views/Evaluation.vue` 还会用课程 ID 公式、`BASE_KNOWLEDGE_ITEMS` 和本地学习行为记录构造掌握度、历史变化和能力雷达。这会让后端 `503 demo-data-disabled` 在浏览器中仍显示看似真实的成绩。

本次追加修复：

- 后端静态评估、学习路径和工作流响应明确标记 `dataSource: demo-fixture` 与 `simulated: true`。
- 前端只有 `VITE_EDUMIND_DEMO_MODE=true` 时才接受 demo fixture；默认值为 `false`。
- 评估页增加 `loading`、`real`、`demo`、`no-data`、`unavailable`、`error` 状态。503、`demo-data-disabled` 和网络错误不会回退到模拟成绩。
- 真实模式只消费服务端评估响应；本地课程完成率和 `useLearningProgressSync` 记录不再叠加到知识掌握度。没有真实知识点证据时，知识树、分布和 Top 5 为空，并显示“暂无真实测评数据”。
- 趋势只使用服务端提供的 `trends`；能力雷达只使用服务端 `profileMetrics`，不再用当前掌握度加减固定公式生成。
- 新增 `src/evaluation-data-policy.test.ts`，覆盖 503、网络失败、空数据、真实响应和显式 Demo 模式；`Evaluation.vue` 的生产路径由 `vue-tsc`/Vite 构建验证。

仍需后续处理：评估页以外的学习路径、星图和部分 Admin 可视化仍包含演示进度或随机运营指标；它们尚未被本次评估页门禁统一，生产产品化前需要按同一 `dataSource` 契约逐页清理。

### Final closeout：来源校验、历史变化和浏览器回归

- `classifyEvaluationResponse` 现在要求 `dataSource: "real"` 且 `simulated` 不能为 `true` 才能进入真实状态；缺少来源、未知来源和模拟标记进入未评估状态。
- Demo 夹具只在显式 `VITE_EDUMIND_DEMO_MODE=true` 时进入评估页，并显示“演示数据，仅供体验”。
- 缺少可验证历史测评时，摘要不再显示本周提升、较上周变化或默认 `+0%`；时间范围选择器已禁用并说明“时间筛选暂未接入”。真实统计摘要会渲染到诊断总结区域。
- 新增 `scripts/evaluation-browser-smoke.mjs`，使用 Playwright Chromium 实际浏览器覆盖 503、空数据、真实数据、无历史、网络失败、Demo 未启用和 Demo 显式启用七个场景。
- 本轮未接入按时间范围查询；需要后端提供历史测评查询契约后再启用筛选。

### Review follow-up：有效证据、薄弱点与输入规范化（2026-10-24）

- 空对象、空数组不再通过 truthy 判断进入真实状态；新增“仅有服务端薄弱点”作为有效评估证据的边界测试。
- 服务端 `dashboard.weaknesses` 现在会在评估页的待提升项目区域显示；没有知识点掌握度证据时显示“暂无”掌握度，不构造百分比，也不会报告 0 个待提升项目。
- 资源生成校验同时检查原始字符串长度，并将 trim 后的 `topic`/`resourceType` 传给 Agent；新增首尾空白超长输入回归。
- 浏览器 Smoke Test 扩展为 9 个场景，覆盖空对象和仅薄弱点响应。

## 下一轮认证与数据模型方案

### 目标模型

建议以 `users` 为正式身份根表，以不可变内部 `user_id`（UUID/BINARY(16)）作为所有业务表的归属键；登录名/邮箱仅做唯一索引。`auth_sessions` 继续保存 token 哈希、过期、撤销、凭据版本和设备信息。

建议新增或统一以下表：

| 表 | 关键列 | 约束 |
| --- | --- | --- |
| `users` | `id`, `login_name`, `password_hash`, `role`, `enabled`, `credential_version` | `login_name` 唯一 |
| `user_profiles` | `user_id`, `profile_json`, `version`, `updated_at` | `user_id` 主键，乐观锁版本 |
| `learning_paths` | `user_id`, `path_json`, `version`, `updated_at` | `(user_id)` 唯一，CAS 更新 |
| `learning_events` | `id`, `user_id`, `session_id`, `event_type`, `payload_json`, `occurred_at` | `(user_id, id)` 索引 |
| `study_sessions` / `study_attempts` | `user_id`, `session_id`, 题目版本、作答和判分列 | `session_id` 唯一；所有查询带 `user_id` |
| `chat_messages` / `tutoring_history` | `user_id`, `interaction_id`, `role`, `content`, `fallback_agents_json` | `(user_id, interaction_id)` 唯一 |

### 迁移与兼容策略

1. 先创建新表和索引，不删除现有 JSON/MySQL 表；迁移脚本使用显式 `source_id`、批次号和幂等 upsert。
2. 将旧字符串 `account_id` 建立 `legacy_account_key` 映射到 `users.id`；无法确认归属的旧单份 `default` 数据进入隔离的迁移待处理集合，不自动分配给真实用户。
3. 双写阶段由服务端会话得到 `user_id`，旧接口仍可读旧列；读路径优先新表，发现缺失时只允许一次可审计的兼容回填。
4. 对 profile/path 使用版本号和 CAS；对聊天、作答和反馈使用 `(user_id, idempotency_key)` 唯一约束。
5. 完成逐账号计数、哈希/JSON 规范化和抽样比对后，再切换读流量；连续一个发布周期无回退后才删除旧写路径。
6. 生产启动检查必须拒绝 JSON fallback、缺少 `CORS_ALLOWED_ORIGINS`、缺少正式身份表或弱默认密码；这些是部署门禁，不在本轮支付工作内。

## 验证记录

- `npm test`：154 通过、46 跳过、0 失败；跳过项均为未配置 MySQL 的跨实例/真实库门禁。
- `npm run test:evaluation-browser`：7 个实际 Chromium 场景通过。
- `npm run build`：通过；保留既有 `/learning-path/knowledge-panel-bg.png` 运行时解析提示和大 chunk 警告。
- `npm run build:mobile`：通过；Capacitor `dist-mobile` 产物生成成功。
