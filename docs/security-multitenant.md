# 多用户安全边界修复

本分支基于 `feat/mobile-v1`，独立处理账号创建、生产存储和学习会话并发问题，不修改 `main`，也不包含支付改动。

## 已修复

- `POST /api/auth/register` 创建正式学生账号，账号、姓名和密码在服务端校验；客户端提交管理员角色不会提升权限。
- Web 与 Capacitor 登录界面只有在显式设置 `VITE_DEMO_MODE=true` 时才预填或展示公开演示账号。
- 生产模式没有共享 MySQL 时，健康检查返回 503，业务请求 fail-closed；不会静默使用 JSON 文件。`ZHIXUE_ALLOW_JSON_PRODUCTION=1` 仅用于 JSON 契约测试，正式部署禁止设置。
- 生产会话 Cookie 和 CSRF Cookie 强制带 `Secure`。
- MySQL 作答幂等键改为 `(account_id, session_id, idempotency_key)`，并在迁移时替换旧的全局索引。
- MySQL 作答和结束练习先锁定会话行；结束练习在同一事务内读取答案、更新状态和写入完成事件。

## 验证边界

- 新增注册、重复账号、角色提升、生产存储 fail-closed 和 Secure Cookie 回归测试。
- 全量测试：150 通过，46 跳过；跳过项均需要未配置的真实 MySQL 环境。
- Web 与移动端构建均通过。

## 尚未证明

- 本环境没有 MySQL 凭据，因此复合唯一索引迁移、真实行锁竞态和双实例一致性尚未在真实数据库执行。
- 尚未完成依赖漏洞扫描、SQL 注入全仓扫描和高并发压测；连接池、模型调用队列和 API 配额仍需单独建立容量基线。
- 生产部署仍需确认 HTTPS 反向代理、`NODE_ENV`/`ZHIXUE_ENV=production`、MySQL 凭据和密钥注入均已生效。
