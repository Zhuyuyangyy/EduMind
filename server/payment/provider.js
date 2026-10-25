import { AlipaySdk } from 'alipay-sdk'
import { readSandboxSdkConfig } from './config.js'

export function isProductionPayment() {
  return ['production', 'prod'].includes((process.env.ZHIXUE_ENV || process.env.NODE_ENV || '').trim().toLowerCase())
}

export function paymentProvider() {
  return isProductionPayment() ? 'vibe-pay' : (process.env.PAYMENT_PROVIDER || 'mock').trim().toLowerCase()
}

export function paymentConfig() {
  const source = process.env.VIBE_PAY_CONFIG_SOURCE || 'environment'
  if (source === 'sandbox-file') {
    if (isProductionPayment()) throw paymentError('payment-sandbox-config-forbidden', 503)
    return readSandboxSdkConfig()
  }
  if (source !== 'environment') throw paymentError('payment-config-source-invalid', 503)
  return {
    appId: process.env.VIBE_PAY_APP_ID || '',
    privateKey: process.env.VIBE_PAY_PRIVATE_KEY || '',
    alipayPublicKey: process.env.VIBE_PAY_ALIPAY_PUBLIC_KEY || '',
    sellerId: process.env.VIBE_PAY_SELLER_ID || '',
    gateway: process.env.VIBE_PAY_GATEWAY || 'https://openapi-sandbox.dl.alipaydev.com/gateway.do',
  }
}

export function paymentError(code, statusCode = 400) {
  return Object.assign(new Error(code), { code, statusCode })
}

export function providerConfigStatus() {
  const provider = paymentProvider()
  const cfg = paymentConfig()
  const production = isProductionPayment()
  const official = cfg.gateway === (production ? 'https://openapi.alipay.com/gateway.do' : 'https://openapi-sandbox.dl.alipaydev.com/gateway.do')
  // Loopback is only for protocol tests; never accepted in production.
  let loopback = false
  try { const u = new URL(cfg.gateway); loopback = u.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(u.hostname) } catch {}
  return {
    provider,
    dataSource: provider === 'mock' ? 'mock' : production ? 'real' : 'sandbox',
    configured: provider === 'mock' || (provider === 'vibe-pay' && Boolean(cfg.appId && cfg.privateKey && cfg.alipayPublicKey && cfg.sellerId) && (official || (!production && loopback))),
  }
}

function sdk() {
  if (paymentProvider() !== 'vibe-pay' || !providerConfigStatus().configured) throw paymentError('payment-provider-not-configured', 503)
  const { sellerId, ...cfg } = paymentConfig()
  return new AlipaySdk({ ...cfg, signType: 'RSA2', camelcase: false, timeout: 10000 })
}

export function amountCents(value) {
  if (typeof value !== 'string' || !/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 4294967295 ? cents : null
}

export function paymentUrls() {
  let base
  try { base = new URL(process.env.PAYMENT_BASE_URL) } catch { throw paymentError('payment-base-url-not-configured', 503) }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/' || (base.protocol !== 'https:' && !(base.protocol === 'http:' && local && !isProductionPayment()))) throw paymentError('invalid-payment-base-url', 503)
  if (isProductionPayment() && local) throw paymentError('invalid-payment-base-url', 503)
  return { returnUrl: `${base.origin}/api/payments/return`, ...(!local ? { notifyUrl: `${base.origin}/api/payments/notify/alipay` } : {}) }
}

export function createCheckout({ order, product, notifyUrl, returnUrl }) {
  const provider = paymentProvider()
  if (provider === 'mock') return { provider, dataSource: 'mock', simulated: true, checkoutUrl: `/api/payments/mock/checkout?orderId=${encodeURIComponent(order.id)}` }
  const params = { returnUrl, bizContent: { out_trade_no: order.id, product_code: 'FAST_INSTANT_TRADE_PAY', total_amount: (order.amountCents / 100).toFixed(2), subject: product.name } }
  if (notifyUrl) params.notifyUrl = notifyUrl
  return { provider, dataSource: providerConfigStatus().dataSource, simulated: !isProductionPayment(), paymentHtml: sdk().pageExecute('alipay.trade.page.pay', 'POST', params) }
}

export function verifyNotification(params) {
  try { return params?.sign_type === 'RSA2' && params.app_id === paymentConfig().appId && sdk().checkNotifySignV2(params) } catch { return false }
}

export async function executeTrade(method, bizContent) {
  try { return await sdk().exec(method, { bizContent }, { validateSign: true }) }
  catch { throw paymentError('payment-provider-result-unverified', 502) }
}
