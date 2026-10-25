# 多用户安全边界修复

本分支基于 `feat/mobile-v1`，独立处理账号创建、生产存储和学习会话并发问题，不修改 `main`，也不包含支付改动。

## 已修复

- `POST /api/auth/register` 创建正式学生账号，账号、姓名和密码在服务端校验；客户端提交管理员角色不会提升权限。
- Web 与 Capacitor 登录界面只有在显式设置 `VITE_DEMO_MODE=true` 时才预填或展示公开演示账号。
- 生产模式没有共享 MySQL 时，健康检查返回 503，业务请求 fail-closed；不会静默使用 JSON 文件，也不存在任何环境变量豁免（`ZHIXUE_ALLOW_JSON_PRODUCTION` 已删除且不再被读取）。生产模式行为测试一律使用真实 MySQL fixture，未配置 MySQL 时明确 skip。
- 生产会话 Cookie 和 CSRF Cookie 强制带 `Secure`。
- MySQL 作答幂等键改为 `(account_id, session_id, idempotency_key)`。初始化先检查真实索引定义：正确结构不执行 DDL；旧的全局唯一索引用一条 `ALTER TABLE ... DROP INDEX ..., ADD UNIQUE KEY ...` 替换；缺失索引只补建；未知结构保留原状并明确失败。
- 索引检查和迁移在同一专用连接的 MySQL 命名锁内执行，按数据库隔离，进程间串行。进程内同时调用初始化共享同一个 Promise，失败后可重试。释放命名锁失败时销毁连接，避免带锁连接回到池中。
- MySQL 作答和结束练习先锁定会话行；结束练习在同一事务内读取答案、更新状态和写入完成事件。

## 验证边界

- 新增注册、重复账号、角色提升、生产存储 fail-closed 和 Secure Cookie 回归测试。
- 历史安全分支全量测试为 150 通过、46 跳过。PR #4 后续 CI 已验证真实 MySQL 209/209；这些计数属于对应提交，不能替代本次迁移修复回归。
- Web 与移动端构建均通过。
- 受控 JSON 演示服务器基线：200 个并发健康检查全部 200（106 ms），40 个并发登录全部 200（160 ms）。这只是单进程演示基线，不代表生产容量。
- 使用 npm 官方 registry 完成依赖审计并升级 `vue`、`mysql2`、`postcss`；通过 overrides 将 `gh-pages` 和 `qs` 固定到修复版本。生产依赖审计从 10 项（含 2 项 critical）降至 1 项间接 `brace-expansion` high，仍需后续处理。

## 尚未证明

- 本机默认 MySQL 服务不作修改；数据库验证使用回环隔离实例和随机临时凭据。真实 MySQL 功能测试通过不等于生产部署、在线迁移和容量压测已验收。
- 尚未完成真实 MySQL 压测；连接池、模型调用队列和 API 配额仍需单独建立容量基线。
- 静态 SQL 拼接检查仅发现内部 schema 迁移使用的列名/定义常量和 `FOR UPDATE` 布尔分支；未发现把用户输入直接拼接进查询的路径。这不是替代专用 SAST/渗透测试的证明。
- `pixi-live2d-display@0.4.0` 仍通过其构建依赖链带入旧版 `brace-expansion`；当前未强制降级到不兼容的 Pixi 5 修复版本，需单独升级 Live2D 依赖并回归移动端/桌面端渲染。
- 生产部署仍需确认 HTTPS 反向代理、`NODE_ENV`/`ZHIXUE_ENV=production`、MySQL 凭据和密钥注入均已生效。

## 2026-10-25 索引迁移回归

新增 `server/study-schema-migration.test.mjs`，真实 MySQL fixture 每次创建独立随机数据库，只清理自己的数据库。两个独立 Node 进程从同一屏障开始初始化，每个进程还同时调用两次初始化；断言实际发送的索引 DDL 数量及数据库最终状态。

1. 正确复合索引重复初始化：索引 DDL 为 0。
2. 两进程并发迁移旧索引：只执行 1 条索引 ALTER，历史作答不丢；不同账号/会话可复用幂等键，同范围重复仍被唯一约束拒绝。
3. 缺失索引并发补建：只执行 1 条索引 ALTER。
4. 意外非唯一索引：拒绝自动修改，保留索引和历史记录。

修复前四项均失败，修复后在隔离 MySQL 8.0 上四项全部通过。此测试由现有 CI 的真实 MySQL 全量测试自动发现；JSON job 明确跳过四项，不能将 skip 算作通过。

本次本地全量：JSON 为 213 项（157 通过、56 明确跳过、0 失败）；隔离真实 MySQL 为 213/213（0 跳过、0 失败），包括四项新回归。Web 与 Mobile 构建通过。

实现范围为 MySQL 8 / InnoDB，同一 MySQL 服务上的协作初始化进程。命名锁不保护不遵守此协议的外部 DDL，也不代替生产迁移窗口、备份或大表 DDL 验证。参考 [MySQL 命名锁](https://dev.mysql.com/doc/refman/8.0/en/locking-functions.html) 与 [原子 DDL](https://dev.mysql.com/doc/refman/8.0/en/atomic-ddl.html)。
