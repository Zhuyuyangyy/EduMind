import crypto from 'node:crypto'

export function paymentProvider() {
  const runtime = (process.env.ZHIXUE_ENV || process.env.NODE_ENV || '').trim().toLowerCase()
  // Production must fail closed to the signed provider. An explicit mock
  // override is useful for local/demo runs but must never create a checkout
  // path that could be mistaken for a real payment in production.
  if (runtime === 'production' || runtime === 'prod') return 'vibe-pay'
  return (process.env.PAYMENT_PROVIDER || 'mock').trim().toLowerCase()
}

function alipayConfig() {
  return {
    appId: process.env.VIBE_PAY_APP_ID || '',
    privateKey: process.env.VIBE_PAY_PRIVATE_KEY || '',
    publicKey: process.env.VIBE_PAY_ALIPAY_PUBLIC_KEY || '',
    gateway: process.env.VIBE_PAY_GATEWAY || 'https://openapi-sandbox.dl.alipaydev.com/gateway.do',
  }
}

function encode(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

function canonical(params) {
  return Object.keys(params).filter(key => params[key] !== undefined && params[key] !== null && params[key] !== '' && key !== 'sign').sort().map(key => `${encode(key)}=${encode(params[key])}`).join('&')
}

function sign(params, privateKey) {
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(canonical(params)); signer.end()
  return signer.sign(privateKey, 'base64')
}

export function createCheckout({ order, product, notifyUrl, returnUrl }) {
  const provider = paymentProvider()
  if (provider === 'mock') return { provider, checkoutUrl: `/api/payments/mock/checkout?orderId=${encodeURIComponent(order.id)}` }
  const cfg = alipayConfig()
  if (!cfg.appId || !cfg.privateKey) throw Object.assign(new Error('Vibe Pay credentials are not configured'), { statusCode: 503, code: 'payment-provider-not-configured' })
  const params = {
    app_id: cfg.appId, method: 'alipay.trade.page.pay', format: 'JSON', charset: 'utf-8', sign_type: 'RSA2', timestamp: new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ''), version: '1.0', notify_url: notifyUrl, return_url: returnUrl,
    biz_content: JSON.stringify({ out_trade_no: order.id, product_code: 'FAST_INSTANT_TRADE_PAY', total_amount: (order.amountCents / 100).toFixed(2), subject: product.name }),
  }
  return { provider, gateway: cfg.gateway, fields: { ...params, sign: sign(params, cfg.privateKey) } }
}

export function verifyNotification(params) {
  const cfg = alipayConfig()
  if (!cfg.publicKey || !params?.sign) return false
  const verifier = crypto.createVerify('RSA-SHA256')
  verifier.update(canonical(params)); verifier.end()
  return verifier.verify(cfg.publicKey, params.sign, 'base64')
}

export function providerConfigStatus() {
  const provider = paymentProvider()
  const cfg = alipayConfig()
  return { provider, configured: provider === 'mock' || Boolean(cfg.appId && cfg.privateKey && cfg.publicKey) }
}
