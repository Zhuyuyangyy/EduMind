import assert from 'node:assert/strict'
import { createCheckout, paymentConfig, paymentUrls, providerConfigStatus } from '../server/payment/provider.js'

// The server loader reads the already verified file directly; never print any
// credentials, public keys, signatures, complete forms or raw provider responses.
assert.equal(process.env.VIBE_PAY_CONFIG_SOURCE, 'sandbox-file')
assert.equal(process.env.PAYMENT_PROVIDER, 'vibe-pay')
assert.equal(providerConfigStatus().configured, true)
const cfg = paymentConfig()
assert.equal(cfg.gateway, 'https://openapi-sandbox.dl.alipaydev.com/gateway.do')
const checkout = createCheckout({ order: { id: 'local-config-signing-check', amountCents: 1 }, product: { name: '沙箱配置签名检查' }, ...paymentUrls() })
assert.ok(checkout.paymentHtml.includes('<form'))
assert.equal(checkout.dataSource, 'sandbox')
console.log('Sandbox configuration: server file mapping and official SDK signing verified; no payment submitted.')
