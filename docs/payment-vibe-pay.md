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

真实 Provider 默认 `VIBE_PAY_CONFIG_SOURCE=environment`，需要环境变量 `VIBE_PAY_APP_ID`、`VIBE_PAY_PRIVATE_KEY`、`VIBE_PAY_ALIPAY_PUBLIC_KEY`、`VIBE_PAY_SELLER_ID`。生产密钥只在服务端密钥环境配置，不发给 Agent、不写进前端、仓库或日志。Node.js 使用官方配置原始 PKCS#1 字符串，不自动转换密钥。

非生产可显式设 `VIBE_PAY_CONFIG_SOURCE=sandbox-file`，服务端从模块位置定位项目根目录的 `.alipay-sandbox.json`，直接读取同一 appIds[0] 的 appId / appPrivatePkcsKey / alipayPublicKey 和 sandboxAccounts.partner.userId。拒绝符号链接或无效配置；生产禁止这个来源。该文件仅由官方 Skill 创建并校验，已忽略且未提交，密钥没有复制到 .env 或源码。

`PAYMENT_BASE_URL` 必须由运营端明确配置，不能从 Host / X-Forwarded-Proto 推导。非生产允许回环 HTTP 回跳并省略不可公网访问的 notify_url；生产必须使用公网 HTTPS 和生产网关，且必须另做公网通知联调。本轮仅使用官方创建的快速沙箱配置，未使用生产凭据。

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
- `npm test`：234 项，175 通过、59 明确跳过、0 失败；跳过为既有 58 个 MySQL 门控与新增 1 个支付多进程 MySQL 用例。
- 隔离 MySQL 8.0 全量：234/234 通过，0 跳过、0 失败；随机临时凭据、回环 33319，未使用个人开发数据库。
- 支付协议测试使用运行时生成的临时测试密钥及回环测试网关，覆盖签名、错误签名/金额/商家/应用、重复表单字段、通知重放、退款事件不发权益、查询状态、网络断开、退款请求号稳定、查询确认退款和撤销权益。它们不是支付宝沙箱交易。
- 支付存储测试覆盖多连接并发和三个独立 Node 进程共享 MySQL 的下单、到账、退款；JSON 损坏、过期、旧订单、跨账号及模拟权益边界。
- Chromium 支付 Smoke：4/4，中性回跳、篡改参数不泄露订单、mock 标识、浏览器实际解析并提交的 POST 表单签名。
- 原评估页 Chromium Smoke：9/9。
- Web 构建通过：首次在系统 TEMP 遇到 esbuild 清理文件 Access is denied，改用仓库 outputs/build-temp 作为该命令的 TEMP/TMP 后重跑成功。Mobile Web 构建通过；原生 Android APK 本轮未构建。
- CI 已追加 Chromium 支付 Smoke。最初支付增量已获得三 job 全绿，后续沙箱加载变动继续跑当前 head 的 CI；远端执行结果以 PR 当前 GitHub Checks 为准，不能用本地通过替代。
- 官方 npm registry 的 `npm audit` 当前报告 7 项（4 high / 3 moderate）。包括新增 SDK 的 urllib@4.9.0 跨源重定向风险及既有 Vite/构建依赖；当前 registry 的 urllib latest 仍为 4.9.0，兼容范围 update 未提供修复版本。本轮未强制升级或宣称依赖安全，正式收款前须解决并复验。

## 未完成与下一步

本轮使用 Skill 内测版。最初缺 jq 后以 CODE_ONLY 开发，随后补齐并获得 READY，通过官方 ensure / reverify 创建并校验同一项目快速沙箱，完成服务端字段映射与官方 SDK 签名后置校验。内测版摘要脚本遇到 Windows jq 输出 CRLF 的格式错误；用无敏感常量验证 jq -r 会带 CR、-br 不带 CR 后，仅在本机 Skill 的 render_summary 中调整为 jq -br，保留原模板和所有校验，再经官方 summary 成功展示。这个本机兼容修正不属于仓库代码，重新安装 Skill 后可能需要上游修复。

真实 Chromium 已通过本地体验入口打开官方 excashier-sandbox.dl.alipaydev.com 收银台，显示 ¥0.01，未见验签错误。初始查询的签名有效，返回 code=40004 / ACQ.TRADE_NOT_EXIST；这一未建交易结果已映射为 not-created，不误报网关故障或支付成功。

`npm run payment:sandbox` 是仅本机的开发体验工具，预览与后端均绑定 127.0.0.1；使用独立 outputs 数据文件、仅子进程启用的 ¥0.01 沙箱价格，提供收银台和服务端查询按钮，正式商品默认停售不变。输出真实本机入口和回跳地址，退出用 Ctrl+C。它不是正式收银台业务 UI，也不代表 App 支付接入。

### 2026-10-26 官方沙箱实际交易补验

用户明确要求代办后，使用官方生成的沙箱买家账号和测试资金，在网页收银台完成一笔 ¥0.01 沙箱付款。没有使用个人支付宝账号、生产密钥或真实资金，没有修改权限、跳过验证码或绕过浏览器安全检查。

| 检查 | 实际结果 |
| --- | --- |
| 网页账号付款、同步回跳 | 到达本地中性结果页，回跳参数没有直接发放权益 |
| 服务端官方交易查询 | 响应验签通过，订单从 pending 变为 paid |
| 权益发放 | 仅 1 份 active 权益，期限为 7 天；重复查询不重复发放或延长 |
| 官方原路全额退款 | 退款响应验签并确认成功，金额为 ¥0.01 |
| 独立官方退款查询 | 响应验签通过，REFUND_SUCCESS，订单号、退款请求号、金额一致 |
| 本地退款状态与权益 | refunded，原权益 revoked；重复退款调用和后续交易查询不恢复权益 |
| 另一笔未付款交易关单 | 网页登录建立待支付交易后停止付款；签名查询确认 WAIT_BUYER_PAY，再关单并查询确认 TRADE_CLOSED，本地 cancelled、无权益 |

证据是官方沙箱实际交易响应和页面操作，不是回环假网关。交易使用隔离的单进程 JSON 开发存储：执行退款/关单领域服务期间暂停本地 API 写入，结束后恢复。操作入口为本机 QA 操作员脚本，未改产品退款 HTTP 的管理员/同账号约束；这一验证不代表学生端或客服退款权限流程已经实现，也不等于真实 MySQL 上的支付宝联调。MySQL 多进程事务验证仍以独立隔离数据库套件为证据。

本地验收记录仅输出状态、金额和断言结果，不提交买家账号、密码、公私钥、签名串、完整支付表单、原始响应或运行时数据。公网 HTTPS 异步通知尚未联调，本轮通过主动查询确认付款及退款；不将其称为全部支付验收通过或生产就绪。

后续先处理依赖风险及公网通知联调，再单独验收商品实际交付与权益执行、用户退款政策、定时补偿/对账和 Web/App 入口。正式上线前还需产品开通、生产配置、HTTPS、运维与备份恢复验收。当前仍不能真实收款，不合并或发布任何分支。

官方依据：[AI 网页应用收款指南](https://aipay.alipay.com/docs/vibe-pay/ai-web-app-payment-qianyi/ai-web-app-payment-integration-guide.html)，[Vibe Pay](https://aipay.alipay.com/docs/vibe-pay.html)。本轮使用 [alipay-aipay-pre Skill](https://www.npmjs.com/package/@alipay/alipay-aipay) 的预发版流程，未办理签约或开通。


## 2026-10-26 Dependency hardening

- The locked `alipay-sdk@4.14.0` dependency tree selected `urllib@4.9.0`, affected by [CVE-2026-55553](https://github.com/advisories/GHSA-hq3h-g68c-hp78). The project now pins `urllib@4.9.1`, the fixed release, using an explicit npm override and the published tarball SHA-512 integrity.
- The initial audit reported 6 advisories after the urllib patch: 3 high and 3 moderate. A non-forced `npm audit fix` updated compatible transitive versions, and the tested override `postcss-selector-parser@7.1.6` avoided a Tailwind major-version migration.
- GitHub Actions on Node 24/npm 11.19.0 then reported **0 vulnerabilities**. The permanent CI audit step is a strict `npm audit` gate. This is dependency-audit evidence only; the final PR CI must also pass the real-MySQL suite, JSON suite, web/mobile builds and browser payment smoke on the final commit.
- No production secrets or sandbox credentials were added to the repository. The temporary remediation workflow is removed from the final branch.

## Public notification readiness

The server callback route is `POST /api/payments/notify/alipay`. The signed local protocol tests verify unauthenticated callback handling, signature/business-field validation, replay idempotency, and rejection of malformed or mismatched events. This is not proof that Alipay can reach a deployed host.

For an external sandbox callback test, deploy this branch to a **dedicated HTTPS staging hostname** with shared MySQL, set `PAYMENT_BASE_URL=https://<staging-host>`, and configure sandbox credentials as protected server-side environment secrets. Keep `NODE_ENV=production` to retain production storage/security gates while setting `ZHIXUE_ENV=staging` so the payment provider remains on the official sandbox gateway. Use `EDUMIND_PAYMENT_PRICE_CENTS=1` and enable payment only in this isolated staging environment. Do not expose `.alipay-sandbox.json`, private keys, full notification bodies, buyer identifiers, or signatures in logs.

Acceptance evidence must show: the generated checkout includes the exact HTTPS notify URL; an actual sandbox payment triggers the public callback; the callback returns the expected acknowledgement; the MySQL order becomes paid exactly once; duplicate notifications do not extend or duplicate entitlements; and refund/close reconciliation remains correct. This public callback test is still pending a staging hostname and deployment authorization. No production collection is enabled.
