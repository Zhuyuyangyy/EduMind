# 智学星枢（EduMind）—— 基于大模型的个性化资源生成与学习多智能体系统

> 项目内部代号 `personalized-learning-platform`（package.json name），当前版本 `1.0.0`。
> 本文档在仓库原有 README 内容基础上补充结构化说明；原有内容（环境启动、评审账号、登录态、验证命令、模型边界）原样保留于下文。

## 项目简介

EduMind（智学星枢）是一个面向个人学习场景的 Web + 移动端一体化平台：前端为 Vue 3 单页应用，后端为 Node.js 服务（MySQL 持久化 + 服务端会话），移动端通过 Capacitor 打包为 Android 应用。平台覆盖"学习对话 → 辅导 → 学习路径 → 评估 → 证据追溯"的完整学习闭环，并提供 3D 交互式学习宇宙（Three.js / PixiJS + Live2D）作为沉浸式学习界面。后端集成 DeepSeek LLM 驱动 RAG 与 Agent 链路（未配置 API Key 时自动降级为内置兜底数据），认证采用服务端会话 + CSRF 防护 + 来源绑定。

## 功能特性

以下特性均可从路由表（`src/router/index.ts`）与视图文件验证：

| 功能 | 路由 | 说明 |
|---|---|---|
| 登录认证 | `/login` | 服务端会话校验；启动时迁移遗留明文 token（`src/lib/auth`） |
| 学习主页 | `/home` | 欢迎页/学习入口 |
| AI 学习对话 | `/dialogue`（`/chat` 重定向至此） | 对话式学习交互 |
| 智能辅导 | `/tutoring` | 辅导视图（Tutor） |
| 学习路径 | `/learning-path`（`/universe` 重定向至此） | 个性化学习路径 |
| 学习评估 | `/evaluation` | 评估视图 |
| 反向评估 | `/reverse-evaluation`（`/knowledge-base` 重定向至此） | 反向评估/知识库视图 |
| 证据与追溯 | `/evidence`、`/evidence-trace` | 证据页与证据追溯（Evidence / EvidenceTrace 视图） |
| 训练流程 | `/trainflow` | 训练流程视图 |
| 主应用视图 | `/edu-mind`、`/resources` | EduMind 主视图 |
| 个人中心 | `/profile` | 用户资料 |
| 设置 | `/settings` | 应用设置 |
| 管理后台 | `/admin` | 管理员仪表盘（`requiresAdmin` 路由守卫） |

**后端能力**（`server/` 目录，均有对应测试文件）：
- 认证与安全：`auth.js`（会话/CSRF/来源绑定）、`identity.js`、`security.js`、`schemas.js`
- 学习核心：`learning-cycle.js`（学习闭环）、`learner-memory.js`（学习者记忆）、`collaboration-sync.js` / `collaboration-data.js`（协作）
- 数据与集成：`data.js`（MySQL 持久化，`mysql2`）、RAG 链路（DeepSeek LLM，见 `.env.example` 的 `LLM_*` 配置项）

**3D/交互**：`src/learning-universe`（Three.js + 自定义 shader）、`src/learning-universe-3d`（PixiJS + Live2D 数字人）、GSAP 动画、ECharts 图表。

**移动端**：Capacitor 7（`@capacitor/android`）+ 安全存储插件（`@aparajita/capacitor-secure-storage`），`android/` 为原生工程目录。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | Vue 3.4+、Vue Router 4、Pinia 2 |
| 语言 | TypeScript 5.4 |
| 构建 | Vite 6、vue-tsc、Tailwind CSS 3、PostCSS |
| 3D/动效 | Three.js、PixiJS 6、Live2D（pixi-live2d-display）、GSAP、ECharts |
| 后端 | Node.js 20+（原生 HTTP 服务 `server/index.js`，默认端口 8788） |
| 数据库 | MySQL 8（mysql2，连接池） |
| LLM | DeepSeek API（`LLM_API_URL` 默认 `https://api.deepseek.com/chat/completions`，模型 `deepseek-chat`） |
| 移动端 | Capacitor 7（Android） |
| 测试 | node:test（内置测试运行器）、Playwright（移动端 E2E） |

## 项目结构

```
EduMind/
├── src/                        # 前端源码
│   ├── views/                  # 16 个页面视图（Login/Welcome/Dialogue/Tutoring/...）
│   ├── router/index.ts         # 路由表与认证守卫
│   ├── learning-universe/      # Three.js 3D 学习宇宙（含 shaders）
│   ├── learning-universe-3d/   # PixiJS + Live2D 交互层
│   ├── components/ composables/ stores/ sdk/ lib/ types/ data/
│   └── main.ts                 # 应用入口（会话恢复后挂载）
├── server/                     # Node.js 后端
│   ├── index.js                # 服务入口（PORT，默认 8788）
│   ├── auth.js identity.js security.js schemas.js
│   ├── learning-cycle.js learner-memory.js
│   ├── collaboration-sync.js collaboration-data.js
│   ├── data.js                 # MySQL 数据访问
│   └── *.test.mjs              # 50+ 服务端测试文件
├── scripts/                    # 构建与工具脚本（dev/build/mobile-e2e/android-build 等）
├── experiments/                # 实验脚本（异常测试/基线捕获/学习闭环用例/RAG 竞赛/DeepSeek 竞赛）
├── android/                    # Capacitor Android 原生工程
├── docs/                       # 审计与规划文档（audit-round1、mobile 系列等 8 篇）
├── public/                     # 静态资源
├── .env.example                # 环境变量模板（含占位符，勿提交真实密钥）
├── capacitor.config.ts
├── vite.config.ts / tailwind.config.js / postcss.config.js / tsconfig.json
└── package.json
```

---

## 环境与启动

需要 Node.js 20 或更高版本及 npm。MySQL 8、Docker Desktop和 OpenAI-compatible 模型密钥均为可选项。

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

前端地址：`http://localhost:5174/`  
后端健康检查：`http://localhost:8788/api/health`

## 评审账号

- 账号：`reviewer`
- 密码：`Zhixue2026!`
- 权限：普通学习者，仅用于体验学情诊断、学习路径、Tutor、测评、Reflection 和证据追溯。
- 管理员入口默认关闭；只有在本地 `.env` 显式配置管理员账号和密码后才可登录。

当前提交材料未承诺持续可用的公网部署地址，请以本地 Demo 为准。评审账号为独立演示账号，不对应真实学生。

## 登录态与数据归属（feat/mobile-v1 起）

- 登录成功后由服务端签发会话（httpOnly Cookie；Capacitor 等原生端使用响应中的 token 走 `Authorization: Bearer`），有效期默认 7 天（`SESSION_TTL_HOURS` 可调）。
- 会话为服务端内存存储：**服务重启后需重新登录**；MySQL 持久化列为后续工作。
- 所有业务接口的账号归属由服务端会话推导，客户端传入的 `accountId` 不再被信任；管理后台入口同样以服务端下发的角色为准。
- CORS 由通配 `*` 改为白名单反射（`CORS_ALLOWED_ORIGINS` 可配置），默认放行本地开发与 Capacitor 来源。
- 聊天与辅导历史按账号隔离，多账号互不可见。

## 验证命令

```powershell
npm test
npm run build
npm run experiment:rag-contest
npm run experiment:anomaly
```

学习闭环实验依赖运行中的后端。先保持 `npm run dev` 运行，再在另一个终端执行：

```powershell
npm run experiment:learning-cycle
```

## 测试

```bash
npm test               # node:test 全量（--test-concurrency=4）
npm run test:navigation  # 导航清理测试
npm run test:chat-api    # 聊天 API 测试
npm run test:mobile-e2e  # 移动端 E2E（Playwright）
```

测试覆盖：服务端认证（会话/CSRF/来源绑定/生产模式）、学习闭环契约、学习者记忆、协作同步、历史可靠性与幂等、知识路径迁移、RAG 边界、演示数据边界、移动端 E2E（导航/数据/学习场景）等（`server/` 下 50+ 测试文件 + `src/` 下若干 `.test.mjs`）。

实验脚本（非测试门禁）：`npm run experiment:anomaly` / `experiment:baseline` / `experiment:learning-cycle` / `experiment:rag-contest` / `experiment:deepseek-contest`。

## 部署

- **Web**：`npm run build` 产出 `dist/`（Vite 静态产物），由任意静态服务器托管；后端 `server/index.js` 需 Node 20+ 运行时 + MySQL 8。
- **移动端**：`npm run build:mobile` → `npm run android:build`（或 `npx cap sync android` 后 Android Studio 构建）。
- **会话与安全配置**（`.env.example`）：`SESSION_TTL_HOURS`（默认 168）、`SESSION_COOKIE_SAMESITE` / `SESSION_COOKIE_SECURE`（Capacitor iOS 需 `None` + `Secure=true`）、`CORS_ALLOWED_ORIGINS`（生产建议显式白名单）。
- 具体生产部署手册：待补充（`docs/` 下有移动端规划文档）。

## 模型和数据边界

配置 `LLM_API_URL`、`LLM_API_KEY`、`LLM_MODEL` 后可调用真实模型；未配置或调用异常时系统进入受限 fallback。知识检索使用本地 96 维 hash embedding 与标签、关键词融合，不依赖外部向量数据库。

第三方组件与素材说明见 `THIRD_PARTY_NOTICES.md`。提交包只保留 `.env.example`，不得打包真实 `.env`。

## 许可证

仓库当前无 `LICENSE` 文件（待补充——许可条款未定）。

## 项目状态

- **维护级别**：MAINTAIN
- **版本**：1.0.0
- **当前分支**：`codex/audit-round1`（远程：https://github.com/Zhuyuyangyy/EduMind ，public）
- **最近提交**：`4e5f352` docs: add round one product audit
- **已知事项**：无 LICENSE；`docs/` 有首轮产品审计与移动端 backlog 文档可参考后续规划。

---

*生成日期：2026-10-21。基于代码与配置核查生成，待人工审核（基于代码自动生成，待人工审核）。*
