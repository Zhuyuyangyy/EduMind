import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import crypto from 'node:crypto'
import http from 'node:http'
import { once } from 'node:events'
import { withTestServer } from './test-server.mjs'
import { amountCents, createCheckout, paymentUrls, providerConfigStatus, verifyNotification } from './payment/provider.js'

// Ephemeral test keys, never persisted and never used against Alipay.
const merchant = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const gatewayKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const raw = key => key.export({ type: key.type === 'private' ? 'pkcs1' : 'spki', format: 'pem' }).toString().split('\n').filter(line => !line.startsWith('---')).join('')
const canonical = (params, exclude = ['sign']) => Object.keys(params).filter(key => !exclude.includes(key) && params[key] !== '').sort().map(key => `${key}=${params[key]}`).join('&')
const sign = params => ({ ...params, sign: crypto.sign('RSA-SHA256', Buffer.from(canonical(params, ['sign', 'sign_type'])), gatewayKeys.privateKey).toString('base64') })
let server, mode = {}, requests = []

before(async () => {
  Object.assign(process.env, { PAYMENT_PROVIDER: 'vibe-pay', EDUMIND_PAYMENT_ENABLED: 'true', EDUMIND_PAYMENT_PRICE_CENTS: '100',
    VIBE_PAY_APP_ID: 'protocol-test-app', VIBE_PAY_SELLER_ID: 'protocol-test-seller', VIBE_PAY_PRIVATE_KEY: raw(merchant.privateKey), VIBE_PAY_ALIPAY_PUBLIC_KEY: raw(gatewayKeys.publicKey),
    PAYMENT_BASE_URL: 'http://127.0.0.1:8788', DEMO_ADMIN_ACCOUNT: 'payment-operator', DEMO_ADMIN_PASSWORD: crypto.randomBytes(20).toString('hex') })
  server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk
    const params = Object.fromEntries(new URLSearchParams(new URL(req.url, 'http://localhost').search + '&' + body))
    try {
      assert.equal(crypto.verify('RSA-SHA256', Buffer.from(canonical(params)), merchant.publicKey, Buffer.from(params.sign, 'base64')), true)
      const biz = JSON.parse(params.biz_content); requests.push({ method: params.method, biz })
      if (mode.disconnect) { req.socket.destroy(); return }
      const data = { code: '10000', msg: 'Success', out_trade_no: biz.out_trade_no, trade_no: `trade-${biz.out_trade_no}`, total_amount: '1.00',
        trade_status: mode.tradeStatus || 'TRADE_SUCCESS', refund_fee: '1.00', fund_change: mode.fundChange || 'Y',
        out_request_no: biz.out_request_no, refund_amount: '1.00', refund_status: mode.refundStatus || 'REFUND_SUCCESS', ...mode.fields }
      const encoded = JSON.stringify(data)
      const signature = crypto.sign('RSA-SHA256', Buffer.from(encoded), mode.badSignature ? merchant.privateKey : gatewayKeys.privateKey).toString('base64')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(`{"${params.method.replaceAll('.', '_')}_response":${encoded},"sign":${JSON.stringify(signature)}}`)
    } catch { res.writeHead(400); res.end('{}') }
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  process.env.VIBE_PAY_GATEWAY = `http://127.0.0.1:${server.address().port}/gateway.do`
})
after(async () => { server?.close(); if (server) await once(server, 'close') })

test('official SDK signs raw Chinese/special characters and verifies once-decoded notifications', () => {
  const notifyUrl = 'https://payathon-staging.example.test/api/payments/notify/alipay'
  const result = createCheckout({ order: { id: 'ord-signature', amountCents: 100 }, product: { name: '智学星枢 & + % 专项包' }, returnUrl: 'https://example.test/api/payments/return?a=1&b=%25', notifyUrl })
  const action = result.paymentHtml.match(/action="([^"]+)"/)[1].replaceAll('&amp;', '&')
  const params = Object.fromEntries(new URL(action).searchParams)
  const hidden = [...result.paymentHtml.matchAll(/<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"/g)]
  assert.ok(hidden.some(field => field[1] === 'biz_content'), 'SDK must produce a POST form')
  for (const [, key, value] of hidden) params[key] = value.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
  assert.equal(crypto.verify('RSA-SHA256', Buffer.from(canonical(params)), merchant.publicKey, Buffer.from(params.sign, 'base64')), true)
  assert.match(params.timestamp, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  assert.equal(params.notify_url, notifyUrl, 'checkout must carry the exact public HTTPS notification URL')
  const notification = sign({ app_id: process.env.VIBE_PAY_APP_ID, sign_type: 'RSA2', subject: '中文 + % &', total_amount: '1.00' })
  assert.equal(verifyNotification(notification), true)
  assert.equal(verifyNotification({ ...notification, total_amount: '1.01' }), false)
  assert.equal(verifyNotification({ ...notification, sign: '' }), false)
  assert.equal(verifyNotification({ ...notification, sign_type: 'RSA' }), false)
})

test('strict fixed-point amounts and configuration reject ambiguous inputs/production mock', () => {
  for (const value of ['1.001', '1e0', '-1', ' 1.00', '1.00 ', '', 'NaN', 1]) assert.equal(amountCents(value), null)
  assert.equal(amountCents('1.2'), 120)
  const base = process.env.PAYMENT_BASE_URL
  process.env.PAYMENT_BASE_URL = 'https://example.test@evil.test/'
  assert.throws(paymentUrls)
  process.env.PAYMENT_BASE_URL = base
  process.env.ZHIXUE_ENV = 'production'
  assert.equal(providerConfigStatus().configured, false, 'loopback test gateway cannot run in production')
  delete process.env.ZHIXUE_ENV
})

async function auth(post, operator = false) {
  const res = await post('/api/auth/login', { account: operator ? process.env.DEMO_ADMIN_ACCOUNT : 'reviewer', password: operator ? process.env.DEMO_ADMIN_PASSWORD : 'Zhixue2026!', role: operator ? 'admin' : 'student' })
  assert.equal(res.status, 200)
  return { Authorization: `Bearer ${(await res.json()).token}` }
}
async function create(post, headers, key) {
  const res = await post('/api/payments/orders', { idempotencyKey: key }, { headers })
  assert.equal(res.status, 201)
  const payload = await res.json()
  assert.match(payload.checkout.paymentHtml, /<form/)
  return payload.order.id
}

test('signed callback validates business fields, duplicates, refund events and public return privacy', async () => {
  await withTestServer(async ({ post, get, baseUrl }) => {
    const headers = await auth(post)
    const id = await create(post, headers, 'callback-idem')
    const params = { app_id: process.env.VIBE_PAY_APP_ID, seller_id: process.env.VIBE_PAY_SELLER_ID, out_trade_no: id, trade_no: `trade-${id}`, trade_status: 'TRADE_SUCCESS', total_amount: '1.00', notify_id: 'callback-1', sign_type: 'RSA2', subject: '星枢 + % &' }
    const notify = values => fetch(`${baseUrl}/api/payments/notify/alipay`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(sign(values)) })
    for (const change of [{ seller_id: 'other' }, { app_id: 'other' }, { total_amount: '1.001' }]) {
      const res = await notify({ ...params, ...change }); assert.equal(res.status, 400); assert.equal(await res.text(), 'fail')
    }
    assert.equal((await notify({ ...params, out_biz_no: 'refund-event' })).status, 200)
    assert.equal((await (await get(`/api/payments/orders/${id}`, { headers })).json()).order.status, 'pending')
    params.notify_id = 'callback-paid'
    for (let n = 0; n < 2; n++) assert.equal(await (await notify(params)).text(), 'success')
    assert.equal((await (await get('/api/payments/entitlements', { headers })).json()).entitlements.length, 1)
    const duplicate = await fetch(`${baseUrl}/api/payments/notify/alipay`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `${new URLSearchParams(sign(params))}&total_amount=99.00` })
    assert.equal(duplicate.status, 400)
    const html = await (await get(`/api/payments/return?out_trade_no=${id}&trade_status=TRADE_SUCCESS`)).text()
    assert.match(html, /正在确认支付结果/); assert.ok(!html.includes(id)); assert.ok(!html.includes('1.00'))
  })
})

test('signed query/refund/close reject unverified responses and preserve pending/unknown states', async () => {
  mode = {}; requests = []
  await withTestServer(async ({ post, get }) => {
    const headers = await auth(post, true)
    const student = await auth(post)
    const id = await create(post, headers, 'query-refund-idem')
    const act = (action, opts = headers) => post(`/api/payments/orders/${id}/${action}`, {}, { headers: opts })
    assert.equal((await act('query', student)).status, 404)
    assert.equal((await act('refund', student)).status, 403)
    mode = { tradeStatus: 'WAIT_BUYER_PAY' }
    assert.equal((await (await act('query')).json()).result.providerState, 'pending')
    mode = { fields: { code: '40004', sub_code: 'ACQ.TRADE_NOT_EXIST' } }
    assert.equal((await (await act('query')).json()).result.providerState, 'not-created')
    mode = { tradeStatus: 'UNRECOGNIZED' }
    assert.equal((await (await act('query')).json()).result.providerState, 'unknown')
    mode = { badSignature: true }
    assert.equal((await act('query')).status, 502)
    mode = { fields: { total_amount: '2.00' } }
    assert.equal((await act('query')).status, 502)
    mode = {}
    assert.equal((await (await act('query')).json()).result.order.status, 'paid')
    assert.equal((await act('close')).status, 409)
    mode = { disconnect: true }
    assert.equal((await act('refund')).status, 502)
    const firstRequest = requests.at(-1).biz.out_request_no
    mode = { fundChange: 'N' }
    assert.equal((await act('refund')).status, 202)
    assert.equal(requests.at(-1).biz.out_request_no, firstRequest)
    const ent = async () => (await (await get('/api/payments/entitlements', { headers })).json()).entitlements[0]
    assert.equal((await ent()).status, 'active')
    mode = { refundStatus: 'PENDING' }
    assert.equal((await act('refund-query')).status, 202)
    mode = { fields: { refund_amount: '0.50' } }
    assert.equal((await act('refund-query')).status, 502)
    mode = {}
    assert.equal((await (await act('refund-query')).json()).result.status, 'succeeded')
    assert.equal((await ent()).status, 'revoked')
    assert.equal((await (await act('query')).json()).result.order.status, 'refunded', 'late paid query cannot resurrect entitlement')
    assert.equal((await ent()).status, 'revoked')
    const pendingId = await create(post, headers, 'close-pending-idem')
    mode = { tradeStatus: 'WAIT_BUYER_PAY' }
    assert.equal((await post(`/api/payments/orders/${pendingId}/close`, {}, { headers })).status, 200)
    assert.equal((await (await get(`/api/payments/orders/${pendingId}`, { headers })).json()).order.status, 'cancelled')
  })
})
