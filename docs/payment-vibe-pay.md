# EduMind Vibe Pay 支付闭环（独立分支）

本分支基于 `feat/mobile-v1`，先落地订单与权益的共享后端契约，不修改 `main`，也不把支付改动混入评估审计 PR。

## 已实现

- 商品目录：`ai-7day-pack`，7 天 AI 专项学习提升包；价格由 `EDUMIND_PAYMENT_PRICE_CENTS` 配置，不在代码中猜测售价。
- 订单：按服务端会话归属账号，`(accountId, idempotencyKey)` 幂等，状态包含 `pending` / `paid` / `cancelled` / `refunded` / `expired`。
- 权益：支付确认后创建 `active` entitlement，结束时间按商品期限计算；订单和权益按账号查询。
- Provider：本地 `mock` 沙箱可创建订单并由已登录账号调用 mock complete 完成支付；同一通知事件重复提交只发放一次权益。
- Vibe Pay 适配边界：真实 Provider 使用 `alipay.trade.page.pay` 字段和 RSA2 签名，异步通知入口验签并核对 `app_id`、订单号、金额和交易状态。未配置支付宝凭据时返回 `payment-provider-not-configured`，不会伪造支付成功。
- 存储：开发/测试使用隔离 JSON 文件；配置 MySQL 时自动创建 `payment_orders`、`payment_notifications`、`user_entitlements` 表，并在通知处理时使用事务和唯一约束。

## API

- `GET /api/payments/products`
- `POST /api/payments/orders`：`{ productId, idempotencyKey }`
- `GET /api/payments/orders/:id`
- `GET /api/payments/entitlements`
- `POST /api/payments/mock/complete`：仅 mock、非生产环境
- `POST /api/payments/notify/alipay`：公开异步通知入口，真实 Provider 必须验签
- `GET /api/payments/return`：同步返回展示入口，不作为权益发放依据

## 当前限制

本分支没有真实支付宝 AppId、私钥、公钥或签约权限，因此尚未执行真实沙箱跳转、支付宝异步通知和退款接口。正式接入前还需要配置官方凭据、完成沙箱测试，并补齐 `alipay.trade.query`、`alipay.trade.refund` 与退款后权益撤销流程。

支付宝官方网页接入指南要求支付结果以异步通知或交易查询为准，通知需验签并核对 `app_id`、`out_trade_no`、`total_amount` 和 `trade_status`。参考：[Vibe Pay 产品接入指南](https://aipay.alipay.com/docs/vibe-pay/ai-web-app-payment-qianyi/ai-web-app-payment-integration-guide.html)。
