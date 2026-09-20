# 智学星枢——基于大模型的个性化资源生成与学习多智能体系统

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

## 模型和数据边界

配置 `LLM_API_URL`、`LLM_API_KEY`、`LLM_MODEL` 后可调用真实模型；未配置或调用异常时系统进入受限 fallback。知识检索使用本地 96 维 hash embedding 与标签、关键词融合，不依赖外部向量数据库。

第三方组件与素材说明见 `THIRD_PARTY_NOTICES.md`。提交包只保留 `.env.example`，不得打包真实 `.env`。
