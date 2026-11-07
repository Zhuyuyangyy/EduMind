# EduMind Mobile P2-2 验收报告 — 真实账号数据接入

分支：`feat/mobile-v1`（基线 P2-1 `a7d2b81` 之后）
提交：`7e7e66b`（P2-2A 契约）→ `ffa1d99`（P2-2B 页面）→ `d560b07`（P2-2C 历史与回归）
状态：**P2-2 完成。真机/模拟器安装验收仍未完成（环境阻塞，延续 P1.5 结论）。main 未合入。**

## 1. 数据契约（P2-2A）

### 端点审计结论

| 端点 | 性质 | 移动端用法 |
|---|---|---|
| `GET /api/profile/latest` | 账号真实画像 | ✅ 今日/成长页 |
| `GET /api/knowledge-path/latest` | 账号真实知识路径（phases/topics/mastery/importance/recommended） | ✅ 今日/成长页 |
| `GET /api/learning-cycles/latest` | 账号真实学习闭环 | ✅ 成长页评估记录 |
| `GET /api/tutoring/history` | 账号辅导历史（q/a/time） | ✅ 导师页 |
| `/api/learning-path`、`/api/evaluation`、`/api/resources/recommended`、`/api/tutoring/topics` | **静态演示内容** | ❌ 不接入账号视图 |

### 服务端契约修复

1. **学习闭环 JSON/MySQL 归一**：`normalizeLearningCycle()` 把两种存储形态统一为同一字段集
   （workflowId/accountId/createdAt/profile/profileBefore/profileChanges/resourcePackage/
   tutoring/evaluation/path/reflection/trace/agentResults），缺失可选字段补 null/空数组，不伪造。
   Web 端只写不读该接口，无影响。
2. **fallback 知识路径补全 topic 契约**：recommended 等字段与 LLM 路径一致（修复了契约洞）。
3. **辅导历史新增 fallbackAgents 元数据**：新记录如实标注降级来源；旧记录无此字段。

### 移动端适配层（`src/mobile/data/`，零 any）

- `types.ts`：KnowledgePath / LearnerProfile（dimensions+radarPoints 双格式）/ LearningCycle / TutorMessage / TodayTopic
- `learning-data.ts`：
  - `fetchAccountData` / `fetchTutoringHistoryItems`：类型化获取 + epoch 校验
  - `profileDimensions`：双格式适配
  - `selectTodayTopic`：**确定性选取**（recommended 池内按 importance 降序 → mastery 升序 → id 字典序），
    返回 topicId/phaseId/选取理由，可追溯、可复现
  - `masteryLabel`：0/0.5/1 映射为「估计未接触/中等/熟练」，**绝不表述为完成率**
  - `historyToMessages`：旧历史 → 来源未记录
  - **epoch 防串号**：登录/退出/切换 API 地址时 `bumpDataEpoch()`，在途旧账号响应丢弃

## 2. 页面接入（P2-2B）

### 今日学习
- 真实画像/路径/闭环按账号拉取；失败 → 错误 + 重试，**不回退未标记演示数据**
- 今日主题展示选取规则、topic ID、重要度、**掌握估计**（标注“模型估计，不是完成率”）
- 空态分流：无画像 → 6 维自评入口（`MobileDiagnose`，source=mobile-self-assessment，UI 标注「自评画像」）；
  有画像无路径 → 生成知识路径入口；「开始学习」携带 topic 上下文进导师页

### 学习成长
- 能力画像/学习路径：真实账号数据；mastery 三档标签可区分
- 评估记录：**仅在有结构化学习闭环时展示**——mastery 条 + 画像变化（before→after+reason，
  真实更新痕迹）；来源按 `trace.fallbackUsed` 区分「智能体评估 / 规则降级生成」
- 连续学习天数/累计答题/掌握度提升：**无可靠数据源 → 「暂无记录」**，不伪造演示数值

### AI 导师（P2-2C）
- 进入即加载服务端历史，整体替换渲染（防重复）
- 来源三级标注：模型生成 / 降级回答 / **来源未记录**（旧历史）
- 今日主题横幅 + 预填启发式问题

## 3. 验收测试（全部真实执行）

### 自动化

| 项 | 结果 |
|---|---|
| `npm test` | **48/48**（P2-2A 新增 8 例：契约双形态单测 + API 往返 + 双账号隔离 + 空账号 null + 静态端点识别） |
| `vue-tsc --noEmit` | 0 错 |
| `npm run build` / `build:mobile` | 通过（移动包 141KB） |
| anomaly / learning-cycle 实验 | 全过 / 15/15 |
| 移动端 E2E 同源模式 | **7/7** |
| 移动端 E2E 跨域模式 | **7/7** |
| **数据层 E2E（`scripts/mobile-e2e-data.mjs`）** | **13/13** |

### 关键场景实测记录（数据层 E2E）

账号 A（reviewer，预置画像+路径+历史）vs 账号 B（student，无数据）：

- **D1** A 今日页显示「编程基础与语法」，掌握估计 0%（mastery=0 正确映射，未误判为完成）
- **D2** A 成长页三种掌握度标签（估计未接触/中等/熟练）+ 真实维度（知识基础 72）
- **D3** A 导师页 2 条历史：旧记录「来源未记录」、降级记录「降级回答」
- **D4** A 退出→B 登录：B 三页全空态；扫描 A 的 7 个专属内容标记**零泄漏**
- **D5** B 退出→A 登录：数据完整恢复
- **D6** 刷新页面：A 数据一致（冷启动一致性）
- **D7** A 新提问：历史刷新，同问题仅出现 1 次（无重复展示）
- **D8** Web↔Mobile 一致：App 内提问，API（网页视角）立即可见

## 4. 遗留问题

| 优先级 | 事项 |
|---|---|
| 发布阻断 | 真机/模拟器安装验收（环境阻塞：本机虚拟化不可用，qemu 不注册 adb 端口） |
| P3 | 真实学习事件记录（连续天数/答题/掌握度变化需要事件源，当前显「暂无记录」） |
| P3 | 自评画像与测评画像的融合修正策略 |
| P4 | Token 安全存储（Keystore/Keychain）、正式身份体系、真实 LLM 分场景统计、签名构建 |
| 已知限制 | 辅导历史在 MySQL 模式下仍存 JSON 文件（data.js 无 MySQL 分支）；账号隔离正确，但不享受 MySQL 持久化 |
