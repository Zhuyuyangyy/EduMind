# 智学星枢 App 前端升级交付记录

日期：2026-10-26。工作分支：`codex/mobile-apple-onboarding`。依据本轮用户任务书，以当前工作区为基线实现；保留先前未提交内容，没有提交、推送或合并 Git。新的深海军蓝任务书取代之前浅色 Apple 风格的默认方向，同时提供可切换浅色主题。

## 1. 实际页面与导航

| 入口 | 本轮结果 |
| --- | --- |
| 首页 `/today` | 稳定每日标语、刷新与收藏、原创 SVG 宠物、25 分钟专注主操作、新人清单、服务器任务、本周统计、知识库/复习/Agent/计划快捷入口 |
| 学习 `/learn` | 今日任务、专注学习、练习测试、学习计划四个子导航；恢复历史练习与查看结果；长期目标和已确认计划记录 |
| 专注 `/focus` | 10/15/25/45 分钟、开始/暂停/继续/重置/结束、服务器恢复、退出确认、实际秒数总结、有效完成条件、资料伴学、目标与本机知识点关联 |
| 星图 `/atlas` | 可平移、缩放、搜索、筛选和点击的知识网络；可展开的阶段地铁路线；依据实际完成作答的能力证据矩阵 |
| 知识库 `/library` | 保留原文导入、检索、段落定位、来源问答、转录、笔记、删除确认与导出；新增 Markdown/Obsidian 多文件和目录导入 |
| 我的 `/profile` | 当前目标、宠物与成长入口、日/周/月时长、目标时间分布、可访问数据表、外观与标语收藏；保留昵称、记忆、提醒、隐私、导出、服务诊断与退出 |
| 宠物 `/pet` | 原创狐狸/猫/兔/猫头鹰选择、成长等级、披风/星冠阶段、星粮喂养、经验与来源账本 |
| Agent `/agent` | 保留任务预览、确认、执行、停止、重试、草稿、笔记与导出；增加安全面板配置入口与目标/知识点/资料上下文 |
| 本地自测 `/self-test` | 单选、多选、判断、填空、简答编辑与作答；人工核对依据、不确定/理解/需复习自评；草稿恢复和 Markdown 导出 |

移动端为四项底栏，桌面端为侧栏与响应式网格。知识库归入星图，自测归入学习，宠物归入我的。保留原登录、问卷/规划、辅导、成长、复习、工作区与练习路由；旧首页、学习和资料视图分别保留在 `/today/classic`、`/learn/classic`、`/atlas/classic`。

## 2. 修改与新增文件

以下列出本轮实现文件；`git status` 中还包含本轮开始前已存在的未提交内容，不能将它们一并归为本轮新增。

### 导航、共享样式和业务接入

- `src/mobile/AppMobile.vue`：四导航、桌面布局、账号状态绑定、主题、弹窗背景隔离与 Agent 入口。
- `src/mobile/router.ts`：新视图、自测、知识库、宠物与旧路由兼容。
- `src/mobile/styles.css`：浅色主题覆盖和共享样式，复用已有 `styles/tokens.css` 的深蓝设计变量。
- `src/mobile/components/MobileIcon.vue`：统一 Lucide 图标，保留原图标组件接口。
- `src/mobile/data/workspace.ts`：补齐前端读取的计时结束、目标和清单更新时间类型；API 契约沿用原实现。
- `src/mobile/data/presentation.ts`：弹窗计数，供背景 inert 使用。
- `src/mobile/views/MobilePractice.vue`、`MobileResult.vue`：不确定标记、题目反馈、来源边界与知识库入口。
- `src/mobile/views/MobileProfile.vue`：整合真实时长、宠物与外观设置。
- `src/mobile/views/MobileAgent.vue`：安全面板管理和上下文适配。

### 新视图

`src/mobile/views/`：`MobileDashboard.vue`、`MobileLearningHub.vue`、`MobileFocus.vue`、`MobileConstellation.vue`、`MobileLibrary.vue`、`MobilePet.vue`、`MobileSelfTest.vue`。

### 可复用组件

`src/mobile/components/`：

- `PageHeader.vue`、`DashboardWidget.vue`、`AppDialog.vue`：标题、面板、弹窗与键盘焦点管理。
- `DailySlogan.vue`、`WidgetCustomizer.vue`、`WeeklyProgressCard.vue`：首页内容与受约束的面板管理。
- `AIPetAvatar.vue`、`AgentLauncher.vue`：原创轻量角色和全局上下文入口。
- `FocusTimer.vue`、`LearningTaskCard.vue`：计时呈现与任务状态。
- `KnowledgeGraph.vue`、`LearningMetroMap.vue`、`AbilityMap.vue`：三种不同星图。
- `VaultImporter.vue`：文件选择、目录/冲突预览、确认写入与错误反馈；切换账号或离开页面后停止后续批量写入。
- `StudyTimeChart.vue`、`ProfileLearningSummary.vue`：复用现有 ECharts，按需加载、缩放重排、主题更新与资源释放；短计时按秒显示。
- `QuestionTools.vue`：不确定标记与服务器题目反馈。

### 状态、规则和验证

- `src/mobile/stores/learning-workspace.ts`：Pinia 统一读取、过期响应丢弃、账号/API 来源隔离、本机设置与奖励。
- `src/mobile/domain/companion.ts`：固定面板 Schema、标语、奖励幂等、喂养、成长、配置校验与时长聚合。
- `src/mobile/domain/markdown-vault.ts`：安全目录规范化、基础 Frontmatter、标题、标签、双链/相对链接与反链。
- `src/mobile/domain/knowledge-graph.ts`：节点状态、连线与稳定布局。
- `src/mobile/domain/frontend-upgrade.test.mjs`：新增 9 项业务规则测试。
- `scripts/mobile-frontend-upgrade-e2e.mjs`：新增 9 组浏览器流程检查。
- `scripts/mobile-onboarding-e2e.mjs`：适配新版首页与计划入口，增加题目反馈、标记恢复和真实练习奖励检查，共 16 组。
- `scripts/mobile-product-v1-e2e.mjs`：适配四导航、新首页与独立知识库，原业务验证保留，共 9 组。
- `docs/plans/2026-10-26-frontend-upgrade.md`：实施清单与数据边界。

本轮没有增加依赖。未改动后端业务或支付流程。记录的后端四个文件和 `package-lock.json` 与执行前 SHA-256 一致，证据为 `outputs/frontend-upgrade/backend-integrity.json`。执行前差异保存在 `outputs/frontend-upgrade/baseline.patch`。

## 3. 已打通的交互和数据来源

1. 真实注册/登录后显示引导卡片，填写、跳过、回退修改、失败重试和重新认识我继续工作；实际服务端保存，零分不被默认值覆盖。
2. 原有问卷建档 → 路径 → 辅导 → 三题作答 → 服务器判分 → 结果与成长记录仍可完成，练习恢复和账号隔离保持。
3. 面板只使用白名单类型与配置 Schema；展示内容、来源、权限和布局预览，确认才新增。可编辑、排序、隐藏、删除、恢复默认、刷新恢复。规则建议明确标记为本地匹配。
4. 计时操作调用现有服务器接口，刷新可恢复；结束保留真实秒数，重置不抹去既有记录，退出需确认暂停或结束。满足条件后才授予专注奖励。
5. 奖励：服务器保存的清单自报完成 +1、真实练习完成 +2、有效专注 +3。专注有效条件为至少计划时长的 80% 且不少于 60 秒。清单奖励明确标记为自报完成，不作为掌握证据。按类型与记录 ID 去重，取消后再勾选不重领。喂养扣 1 星粮、加 10 经验；无粮不可喂，交互期间抑制连点。
6. Obsidian 导入只读取主动选择的文件；确认前不上传。文本正文与路径名称使用现有私有资料接口，目录元数据、Frontmatter 与链接索引保存在本机。支持跳过、覆盖、保留副本、失败逐文件反馈与原始 Markdown 导出。MDX 仅作为文本，不执行脚本。
7. 知识网络展示实际路径与笔记关系；路线展示阶段顺序或目标已确认任务；能力矩阵展示可归因的已完成题目证据，没有证据不补造精确能力分数。
8. 题目不确定标记在本机保存；纠错反馈保存到服务器当前账号。自测的手工核对与权威题库判分明确分开。
9. 计时图表使用实际结束记录；目标筛选只统计有归属的数据。练习没有目标归属时显示不可归因，不混入其他目标。当前周从周一开始，日/月按 UTC+8 自然日期统计。

## 4. 演示态、本机态与后端缺口

新增生产页面没有随机分数、虚构时长、占位练习成绩或伪造模型成功结果。标语库和原创宠物是产品静态内容，不是模型调用。测试在独立的本机 demo 环境创建真实测试账号、调用真实 API；截图中的学习者与内容属于测试数据。原有 Markdown 回答安全测试使用有界浏览器夹具并在测试中标明。

| 边界 | 当前实现与不能宣称的能力 |
| --- | --- |
| 面板和宠物服务端存储不存在 | 按账号和 API 来源保存到本机，刷新可恢复；不提供跨设备同步、服务端奖励对账或防篡改保证。清理浏览器数据会丢失这些本机状态 |
| 面板意图理解 | 本地关键词匹配固定 Schema；没有伪装成 LLM 动态设计或任意代码执行。添加“提醒面板”不等于创建系统定时通知，真实提醒仍在既有提醒设置中管理 |
| 多题型权威评分 | 现有后端仅支持题库单选。其他题型为用户编写、本机作答、人工核对，不产生服务器成绩、权威错题或奖励 |
| 路径和练习归属 | 当前路径接口没有长期目标归属，练习事件也没有目标字段；不能提供任意课程的精确归属统计。目标筛选时显示缺口，不借用其他路径数据 |
| 能力与前置关系 | 能力证据矩阵基于当前路径阶段；不是完整的跨项目能力测评。笔记双链和同阶段关系不冒充已核验的先修依赖 |
| 记录范围 | 能力聚合最多读取最近 8 个已完成会话，事件接口最近 50 条、会话列表也有服务端窗口限制；不是全量长期历史统计，不提供不可靠同比增长 |
| 学习计划 | 目标可编辑/暂停/恢复/完成，阶段与已确认任务可查看；计划调整保留独立 Agent 任务记录。尚无完整里程碑/先修关系编辑接口或逐字段版本 diff |
| Obsidian | 基础 Markdown/Frontmatter 解析，MDX 纯文本；不执行插件、不加载图片附件、不覆盖完整 YAML 语义。目录和链接元数据暂不跨设备同步。每批最多 40 文件、2 MB，每份文本最多 120,000 字符、路径最多 160 字符；资料接口还有既有容量限制 |
| 图谱规模 | 单次绘图最多显示 60 个匹配节点，可搜索缩小范围；使用轻量 SVG 和列表，没有引入 3D 引擎 |
| 设置 | 当前语言为简体中文，未伪装提供完整英文翻译；主题实际生效。提醒、记忆、隐私和导出继续沿用已存在的真实设置能力 |

## 5. 实际验证结果

| 验证 | 结果 |
| --- | --- |
| `npm test` | 230 项：171 通过、0 失败、59 跳过；跳过项需要未配置的 MySQL 环境，不视为通过 |
| 新增领域规则测试 | 9 / 9 通过（已计入上述总数） |
| `npm run build` | 通过，包含 TypeScript 检查与网页版构建 |
| `npm run build:mobile` | 通过，包含 TypeScript 检查与移动生产包构建 |
| `npm run test:mobile-onboarding` | 16 / 16 组通过 |
| `npm run test:welcome-cards` | 9 / 9 组通过 |
| `npm run test:mobile-product-v1` | 9 / 9 组通过 |
| `node scripts/mobile-frontend-upgrade-e2e.mjs` | 9 / 9 组通过 |
| 手机/桌面浏览器 | 320、390、430、1280、1440 宽度核心页面无文档横向溢出；检查弹窗焦点、Esc、背景 inert、减少动态效果、冷启动、主题持久化和跨账号隔离 |
| Android | Capacitor 同步与 Debug 构建；产物及资源一致性另见 `outputs/frontend-upgrade/apk-verification.json` |

日志位于 `outputs/frontend-upgrade/`，新浏览器流程的检查记录和截图在 `outputs/frontend-upgrade/browser/`。截图已人工检查移动首页、桌面三面板和浅色个人中心；未把截图检查替代为真实手机硬件验收。

## 6. 剩余限制与建议

- 这次是可运行的前端及既有 API 集成，没有完成不存在的宠物云账本、多题型判分、跨目标能力归属或 Obsidian 同步服务。
- 59 项 MySQL/生产存储相关测试本轮未实测。正式上线前应在独立 MySQL 测试环境补跑，不能据本轮浏览器测试宣称生产认证或支付已验收。
- 没有在 Android 真机或系统软键盘上完成交互验收；当前证据为真实桌面 Chromium 手机视口、生产资源构建与 Debug APK。iOS 原生打包不在本机完成。
- ECharts 独立按需块约 505 kB，构建保留现有大块体积警告；没有为消除警告而引入新依赖或调整业务架构。
- 本机设置不能抵御用户手改 localStorage 或多个设备之间的并发领奖。要形成正式成长权益，应先建立服务端事务账本，再接同步与运营能力。
- 下一步优先补服务端统一事件/目标归属、宠物账本与笔记元数据存储；之后再扩展多题型与复杂图谱编辑。

预览：`http://127.0.0.1:5174/?preview=frontend-upgrade-20261026#/today`。Android 文件为 `outputs/frontend-upgrade/智学星枢_App前端升级_Debug_20261026.apk`（4,538,539 字节，SHA-256 `cc643f905696947f4e8d23fc03a4acb1ef86041a9fd0df5297701f7025dd5799`）。包内 9 个前端资源逐项匹配 `dist-mobile`。这是 Debug APK，不是商店发布包。没有自动安装到用户设备，也没有进行部署或 Git 提交。
