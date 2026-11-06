# 智学星枢 · 竞赛版本工程审计报告

- 审计日期：2026-11-06
- 审计人：Qoder Agent（竞赛执行任务书 §5.2 要求）
- 审计对象：`github.com/Zhuyuyangyy/EduMind.git` @ `main`（a3b2c2f）
- 竞赛工作区：`D:\ZYY_Inovation\QoderEdumind`
- 竞赛分支：`competition/qoder-2026-studyhack`（基于 main 创建，未修改 main）

---

## 1. 仓库与分支状态

| 项目 | 审计结果 |
|---|---|
| 远程仓库 | `https://github.com/Zhuyuyangyy/EduMind.git` |
| 克隆结果 | 完整克隆至竞赛工作区，`git status` 干净，HEAD = a3b2c2f（docs: rebuild EduMind README） |
| 现有分支 | main、codex/*（5 个）、feat/*（2 个）、trae/*（2 个）——均未被触碰 |
| 竞赛分支 | `competition/qoder-2026-studyhack` 已创建并检出 |
| 未提交改动 | 无（克隆为干净状态） |
| 密钥文件 | 仓库内无 `.env`（仅有 `.env.example` 占位符），历史提交 9a9edff 已清理泄露密钥 |

**结论**：分支隔离要求达成。竞赛版本所有改动只进入 `competition/qoder-2026-studyhack`，main 与其他比赛/功能分支不受影响。

## 2. Web 前端结构

- Vue 3.5 SPA + Vue Router 4 + Pinia 2 + TypeScript 5.4 + Vite 6 + Tailwind 3（`src/`，16 个视图）。
- 路由表 `src/router/index.ts`：`/login`、`/home`、`/dialogue`、`/tutoring`、`/learning-path`、`/evaluation`、`/reverse-evaluation`、`/evidence`、`/trainflow`、`/profile`、`/settings`、`/admin` 等，带认证守卫与 `requiresAdmin`。
- 3D/交互层：`src/learning-universe`（Three.js）、`src/learning-universe-3d`（PixiJS + Live2D）、GSAP、ECharts。
- 入口 `src/main.ts`：会话恢复后才挂载应用。

**审计判断**：原前端强绑定登录态与后端会话，**不适合直接公网演示**（评委无法注册/登录）。竞赛版按任务书采用「独立竞赛前端」路线，不复用该 SPA 的运行时，只复用其数据内容、判分/画像规则与设计语言。

## 3. Mobile 项目结构

- Capacitor 7 + `@capacitor/android`，原生工程在 `android/`，`src/mobile/` 为移动端视图（AppMobile.vue 等）。
- `mobile.html` + `scripts/build-mobile.mjs` 独立移动端构建链。
- 安全存储插件 `@aparajaja/capacitor-secure-storage`（postinstall 有 patch 脚本）。

**审计判断**：移动端为 Capacitor 原生链路，与 Qoder Sites 静态部署无关，竞赛版不涉及；其 E2E 脚本（Playwright）可作为竞赛版测试方法学参考。

## 4. 后端 API

- `server/index.js`：原生 Node HTTP 服务，默认端口 8788，`/api/health` 健康检查。
- 模块：`auth.js`（会话/CSRF/来源绑定）、`identity.js`、`security.js`、`schemas.js`、`learning-cycle.js`、`learner-memory.js`、`collaboration-*.js`、`data.js`（MySQL/mysql2 连接池，JSON 存储降级）。
- 学习核心：`server/study/`（exercise-bank、scoring、profile-updater、feedback、repository）、`server/agents/`（tutor/path/profile/reflection 等 8 个 Agent）。

**审计判断**：后端依赖 MySQL + 服务端内存会话 + LLM Key，**不适合公网无登录演示**。竞赛版采用任务书 §5.4 许可的「本地演示数据 + 浏览器本地存储」路线；核心算法从 `server/study/` 移植为客户端确定性纯函数。

## 5. 认证机制

- 服务端会话（httpOnly Cookie，原生端 Bearer token），默认 7 天，服务端内存存储（重启需重登）。
- CSRF 防护 + 来源绑定；CORS 白名单反射；账号归属由服务端会话推导，不信任客户端 accountId。
- 演示账号 `reviewer` / `Zhixue2026!`（仅本地 .env 配置，仓库无真实 .env）。

**审计判断**：竞赛版**移除全部认证要求**（任务书 T01/T12：无需登录可访问），不暴露任何管理员接口，不使用真实学生信息。

## 6. RAG 与模型调用

- `server/llm/provider.js`：DeepSeek OpenAI 兼容接口（`LLM_API_URL`/`LLM_API_KEY`/`LLM_MODEL`），未配置或调用异常时降级为内置兜底数据。
- 知识检索：本地 96 维 hash embedding + 标签/关键词融合，无外部向量数据库。

**审计判断**：竞赛版无后端、无 API Key（安全要求：密钥不得进前端）。AI 导师采用**预置课程知识库检索**并明确标注「演示模式」，遵守任务书「不得伪装成实时模型服务」红线；检索算法参考原工程的 hash embedding/关键词融合思路简化为可解释的词项加权匹配。

## 7. 可复用的验证资产（竞赛版直接移植/参考）

| 原工程文件 | 复用方式 |
|---|---|
| `server/study/scoring.js` | 判分规则原样移植为客户端纯函数（选择题严格相等、未知题型判错、会话汇总） |
| `server/study/profile-updater.js` | 掌握度更新规则移植：证据量门槛、稳定区间 [0.4, 0.8) 不调整、单次变化上限 ±MAX_DELTA、钳制 0-100 |
| `server/study/exercise-bank.json` | 题库格式参考（id/topic/knowledgePoint/difficulty/type/prompt/choices/answer/explanation） |
| `src/data/courses.ts` | 课程与知识点的数据组织方式参考 |
| `README.md` 验证命令体系 | 竞赛版测试体系参考（node:test 单测 + Playwright E2E） |

## 8. 测试情况（如实说明）

- 原工程测试资产：`server/` 下 50+ 个 `*.test.mjs` + `src/` 下若干测试 + Playwright 移动端 E2E 脚本。
- **本次审计已在竞赛工作区实跑原工程测试套件**（`npm test`，Node 24，2026-11-06）：**18/18 通过，0 失败**，其中包含竞赛版直接移植的规则测试——`profile write-back changes only the evidenced dimension and stays bounded`（证据驱动的画像写回）、`hybrid retrieval exposes weighted component scores`（混合检索）、`LLM timeout and invalid JSON both return the declared fallback shape`（模型失败降级）、`profile persistence falls back to JSON when MySQL is not configured`。证据文件：`evidence/test_results/edumind-baseline-test-run.txt`。
- 演示课程《Python 数据分析基础》诊断题库在原工程中不存在（现有 exercise-bank 仅 10 道算法题），按任务书 §3 模块 B 范围新建，全部标记为示例数据。

## 9. 部署方式

- 原工程 Web：`npm run build` → `dist/` 静态产物 + Node 后端；移动端 Capacitor Android。
- 竞赛版：Vite 静态产物 → **Qoder Sites**（`spa: true` SPA fallback），无后端、无密钥、无数据库写入。

## 10. 审计结论与改造方案

1. **不推翻原架构**：原仓库完整保留在竞赛分支中，仅新增 `astripath/` 竞赛应用目录。
2. **技术路线**：Vue 3 + Vite + TypeScript 独立静态 SPA（与原工程同栈，降低认知成本），Pinia + localStorage 持久化，ECharts 图表，左侧导航 + 主内容区，响应式 1440/375。
3. **数据路线**：演示课程数据 + 题库 + 导师知识库全部内置为静态数据，明确标注示例数据。
4. **AI 路线**：预置知识库检索问答，全界面标注「演示模式」。
5. **安全路线**：无任何密钥、无真实个人信息、无支付、无管理接口、无可写数据库。

审计完成，进入竞赛版本开发。
