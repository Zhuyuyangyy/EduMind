# EduMind AI 网页应用收款：后端接入与验收边界

当前工作分支为 `codex/payment-vibe-pay`，追加到 PR #2；已在本地整合 PR #4 的安全、账号隔离与数据真实性基线。PR 的目标仍为 `feat/mobile-v1`；不修改 main、不合并任何 PR。PR #4 未合并时，PR #2 的差异包含这一依赖基线，请先审 #4，再审本支付增量。

## 当前行为

- 使用官方 `alipay-sdk@4.14.0`：`pageExecute('alipay.trade.page.pay', 'POST', …)` 生成支付表单；请求签名交给 SDK，通知使用 `checkNotifySignV2`，所有服务端查询/退款/关单响应强制验签。修复旧实现“URL 编码后再签名”的错误。
- 通知先验证表单、重复字段、RSA2、app_id、seller_id、订单、精确到分的金额和交易号，再处理事件；退款/辅助事件不认作付款成功。异常返回纯文本 fail，成功返回 success。不保存完整通知中的买家个人信息，仅存幂等所需事件字段。
- 仅付款成功通知或签名有效的交易查询可以发放权益；公开回跳页忽略全部 URL 参数，不查询订单、不展示金额、不宣称成功。浏览器返回不作为发放依据。
- 订单持有价格、期限、来源、appId、sellerId 快照。通知重放、不同事件重复到账、重复退款均不会重复发放或延长权益；退款后的延迟支付事件不恢复权益。关单后的支付事件进入需人工核对的错误状态。
- JSON 仅限单进程非生产开发，进程内写入排队；文件损坏明确失败。生产缺 MySQL 一律 503。MySQL 对订单先加行锁，然后原子写入状态、事件、权益；唯一约束覆盖账号幂等键、交易号与订单权益。
- 所有订单操作使用服务端会话账号。退款是管理员操作且仍限定当前账号；尚未设计客服跨账号退款权限和用户退款政策。仅支持单订单一次全额退款，不接受客户端退款金额。
- 同一次退款超时后保存 pending 与固定退款请求号，重试复用全部参数；fund_change=N/缺失不认作成功，后续以同一请求号查询，只有完整金额的确认结果才撤销权益。
- 查询保留 pending / unknown，签名、金额或订单不符则明确失败。查询、退款查询是补偿入口；本轮未增加后台定时对账任务。
- mock / sandbox / real 来源明确返回，模拟权益不会出现在沙箱/生产权益查询中。生产强制真实 Provider，拒绝 mock 和本地测试网关。真实模式的网关、应用与卖家配置必须匹配。

## 配置与默认停售

`EDUMIND_PAYMENT_ENABLED=false` 为默认值，且价格默认为空。只有显式设为 true 并配置合法正整数分值才允许下单；本轮没有授权/设定商品正式售价，也不代表 7 天商品服务已可交付。保持停售直到真实学习交付、权益执行点、退款政策与支付验收均完成。

真实 Provider 需要环境变量 `VIBE_PAY_APP_ID`、`VIBE_PAY_PRIVATE_KEY`、`VIBE_PAY_ALIPAY_PUBLIC_KEY`、`VIBE_PAY_SELLER_ID`。密钥只在服务端密钥环境配置，不发给 Agent、不写进前端、仓库或日志。Node.js 使用官方配置原始 PKCS#1 字符串，不自动转换密钥。

`PAYMENT_BASE_URL` 必须由运营端明确配置，不能从 Host / X-Forwarded-Proto 推导。非生产允许回环 HTTP 回跳并省略不可公网访问的 notify_url；生产必须使用公网 HTTPS 和生产网关，且必须另做公网通知联调。当前没有真实沙箱配置，未读取或使用任何真实支付宝凭据。

## API

| 接口 | 边界 |
| --- | --- |
| GET /api/payments/products | 登录后查看目录与 available，不表示可以收款 |
| POST /api/payments/orders | productId、幂等键；服务端计算金额，返回 POST paymentHtml |
| GET /api/payments/orders/:id | 仅当前账号 |
| POST /api/payments/orders/:id/query | 签名交易查询及幂等补发 |
| POST /api/payments/orders/:id/refund | 管理员且同账号，全额退款 |
| POST /api/payments/orders/:id/refund-query | 同账号，查询固定退款请求并确认撤销权益 |
| POST /api/payments/orders/:id/close | 同账号，先查询，只有待支付订单可关单 |
| GET /api/payments/entitlements | 同账号、同数据来源，过期状态即时计算 |
| POST /api/payments/notify/alipay | 公开表单通知，完整验签和业务校验 |
| GET /api/payments/return | 中性回跳页面，不读取 URL 中的订单和结果 |
| GET /api/payments/mock/checkout | 非生产 mock 模式，显示模拟支付标识 |
| POST /api/payments/mock/complete | 非生产 mock 模式且仅同账号 |

Web 与 Capacitor 后续可以复用这些账号、订单和权益接口；本轮没有开发收银台业务 UI、原生 App 支付或业务权益拦截。

## MySQL 迁移与兼容

首次使用支付存储时，按原有模式创建支付表；新增小范围 v2 迁移在专用连接取得 MySQL GET_LOCK 后检查列/索引：

1. payment_orders 补充 nullable 的 duration_days、data_source、app_id、seller_id，保留历史行，不猜填真实来源和历史权益期限。
2. 增加唯一索引 payment_order_trade(provider, data_source, provider_trade_no)。历史重复交易会使迁移失败，需人工对账；已存在但结构不正确的同名索引明确失败，禁止盲目删建。
3. 增加 payment_refunds：order_id 主键、request_id 唯一、分值、pending/succeeded 和时间戳。
4. 原订单、通知、权益均不删除。缺少来源/期限证据的旧订单不会被自动确认为真实支付；应以官方交易记录人工核对后另行迁移，不能直接重建订单让用户再次付款。

先备份再部署；生产运行账号需要相应 DDL 权限或由运维预先迁移。MySQL DDL 不属于业务事务回滚范围，本轮仅验证隔离测试库；真实已有生产库升级、备份恢复及零停机迁移未验证。

## 本轮验证

- Node 24 / Windows x64。
- `npm test`：232 项，173 通过、59 明确跳过、0 失败；跳过为既有 58 个 MySQL 门控与新增 1 个支付多进程 MySQL 用例。
- 隔离 MySQL 8.0 全量：232/232 通过，0 跳过、0 失败；随机临时凭据、回环 33319，未使用个人开发数据库。
- 支付协议测试使用运行时生成的临时测试密钥及回环测试网关，覆盖签名、错误签名/金额/商家/应用、重复表单字段、通知重放、退款事件不发权益、查询状态、网络断开、退款请求号稳定、查询确认退款和撤销权益。它们不是支付宝沙箱交易。
- 支付存储测试覆盖多连接并发和三个独立 Node 进程共享 MySQL 的下单、到账、退款；JSON 损坏、过期、旧订单、跨账号及模拟权益边界。
- Chromium 支付 Smoke：4/4，中性回跳、篡改参数不泄露订单、mock 标识、浏览器实际解析并提交的 POST 表单签名。
- 原评估页 Chromium Smoke：9/9。
- Web 构建通过：首次在系统 TEMP 遇到 esbuild 清理文件 Access is denied，改用仓库 outputs/build-temp 作为该命令的 TEMP/TMP 后重跑成功。Mobile Web 构建通过；原生 Android APK 本轮未构建。
- CI 已追加 Chromium 支付 Smoke。远端执行结果以当前 PR 的 GitHub Checks 为准，不能用本地通过替代。
- 官方 npm registry 的 `npm audit` 当前报告 7 项（4 high / 3 moderate）。包括新增 SDK 的 urllib@4.9.0 跨源重定向风险及既有 Vite/构建依赖；当前 registry 的 urllib latest 仍为 4.9.0，兼容范围 update 未提供修复版本。本轮未强制升级或宣称依赖安全，正式收款前须解决并复验。

## 未完成与下一步

本轮 Skill 为内测版，Windows 检查缺 jq 后选择 CODE_ONLY，sandboxConfigState=VERIFY_PENDING。官方快速沙箱创建、同应用密钥后置校验、真实收银台付款、支付宝公网异步通知、真实查询/退款/关单均未验证；本地协议夹具不能替代这些证据。

后续先恢复 Skill 快速沙箱环境并使用官方沙箱配置完成联调，再单独验收商品实际交付与权益执行、用户退款政策、定时补偿/对账和 Web/App 入口。正式上线前还需产品开通、生产配置、HTTPS、运维与备份恢复验收。当前仍不能真实收款，不合并或发布任何分支。

官方依据：[AI 网页应用收款指南](https://aipay.alipay.com/docs/vibe-pay/ai-web-app-payment-qianyi/ai-web-app-payment-integration-guide.html)，[Vibe Pay](https://aipay.alipay.com/docs/vibe-pay.html)。本轮使用 [alipay-aipay-pre Skill](https://www.npmjs.com/package/@alipay/alipay-aipay) 的预发版流程，未办理签约或开通。
