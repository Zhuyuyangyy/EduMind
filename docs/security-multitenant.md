# 多用户安全边界修复

本分支基于 `feat/mobile-v1`，独立处理账号创建、生产存储和学习会话并发问题，不修改 `main`，也不包含支付改动。

## 已修复

- `POST /api/auth/register` 创建正式学生账号，账号、姓名和密码在服务端校验；客户端提交管理员角色不会提升权限。
- Web 与 Capacitor 登录界面只有在显式设置 `VITE_DEMO_MODE=true` 时才预填或展示公开演示账号。
- 生产模式没有共享 MySQL 时，健康检查返回 503，业务请求 fail-closed；不会静默使用 JSON 文件，也不存在任何环境变量豁免（`ZHIXUE_ALLOW_JSON_PRODUCTION` 已删除且不再被读取）。生产模式行为测试一律使用真实 MySQL fixture，未配置 MySQL 时明确 skip。
- 生产会话 Cookie 和 CSRF Cookie 强制带 `Secure`。
- MySQL 作答幂等键改为 `(account_id, session_id, idempotency_key)`，并在迁移时替换旧的全局索引。
- MySQL 作答和结束练习先锁定会话行；结束练习在同一事务内读取答案、更新状态和写入完成事件。

## 验证边界

- 新增注册、重复账号、角色提升、生产存储 fail-closed 和 Secure Cookie 回归测试。
- 全量测试：150 通过，46 跳过；跳过项均需要未配置的真实 MySQL 环境。
- Web 与移动端构建均通过。
- 受控 JSON 演示服务器基线：200 个并发健康检查全部 200（106 ms），40 个并发登录全部 200（160 ms）。这只是单进程演示基线，不代表生产容量。
- 使用 npm 官方 registry 完成依赖审计并升级 `vue`、`mysql2`、`postcss`；通过 overrides 将 `gh-pages` 和 `qs` 固定到修复版本。生产依赖审计从 10 项（含 2 项 critical）降至 1 项间接 `brace-expansion` high，仍需后续处理。

## 尚未证明

- 本环境没有 MySQL 凭据，因此复合唯一索引迁移、真实行锁竞态和双实例一致性尚未在真实数据库执行。
- 尚未完成真实 MySQL 压测；连接池、模型调用队列和 API 配额仍需单独建立容量基线。
- 静态 SQL 拼接检查仅发现内部 schema 迁移使用的列名/定义常量和 `FOR UPDATE` 布尔分支；未发现把用户输入直接拼接进查询的路径。这不是替代专用 SAST/渗透测试的证明。
- `pixi-live2d-display@0.4.0` 仍通过其构建依赖链带入旧版 `brace-expansion`；当前未强制降级到不兼容的 Pixi 5 修复版本，需单独升级 Live2D 依赖并回归移动端/桌面端渲染。
- 生产部署仍需确认 HTTPS 反向代理、`NODE_ENV`/`ZHIXUE_ENV=production`、MySQL 凭据和密钥注入均已生效。
