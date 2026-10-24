import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withTestServer } from './test-server.mjs'

process.env.PAYMENT_PROVIDER = 'mock'
process.env.EDUMIND_PAYMENT_PRICE_CENTS = '100'

async function login(post, account = 'reviewer') {
  const response = await post('/api/auth/login', { account, password: account === 'reviewer' ? 'Zhixue2026!' : 'student123', role: 'student' })
  assert.equal(response.status, 200)
  return (await response.json()).token
}

test('mock payment creates an idempotent order and grants a seven-day entitlement once', async () => {
  await withTestServer(async ({ get, post }) => {
    const token = await login(post)
    const headers = { Authorization: `Bearer ${token}` }
    const products = await get('/api/payments/products', { headers })
    assert.equal(products.status, 200)
    assert.equal((await products.json()).products[0].productId, 'ai-7day-pack')

    const created = await post('/api/payments/orders', { productId: 'ai-7day-pack', idempotencyKey: 'order-idem-1' }, { headers })
    assert.equal(created.status, 201)
    const createdPayload = await created.json()
    assert.equal(createdPayload.order.status, 'pending')
    assert.equal(createdPayload.order.amountCents, 100)
    assert.match(createdPayload.checkout.checkoutUrl, /mock\/checkout/)

    const duplicate = await post('/api/payments/orders', { productId: 'ai-7day-pack', idempotencyKey: 'order-idem-1' }, { headers })
    assert.equal(duplicate.status, 200)
    const duplicatePayload = await duplicate.json()
    assert.equal(duplicatePayload.idempotent, true)
    assert.equal(duplicatePayload.order.id, createdPayload.order.id)

    const completed = await post('/api/payments/mock/complete', { orderId: createdPayload.order.id, eventId: 'mock-event-1' }, { headers })
    assert.equal(completed.status, 200)
    const completedPayload = await completed.json()
    assert.equal(completedPayload.order.status, 'paid')
    assert.equal(completedPayload.entitlements.length, 1)
    assert.equal(completedPayload.entitlements[0].status, 'active')

    const repeated = await post('/api/payments/mock/complete', { orderId: createdPayload.order.id, eventId: 'mock-event-1' }, { headers })
    assert.equal(repeated.status, 200)
    assert.equal((await repeated.json()).entitlements.length, 1)
  })
})

test('payment orders and completion stay isolated by account', async () => {
  await withTestServer(async ({ get, post }) => {
    const tokenA = await login(post, 'reviewer')
    const tokenB = await login(post, 'student')
    const headersA = { Authorization: `Bearer ${tokenA}` }
    const headersB = { Authorization: `Bearer ${tokenB}` }
    const created = await post('/api/payments/orders', { idempotencyKey: 'isolation-1' }, { headers: headersA })
    const orderId = (await created.json()).order.id
    assert.equal((await get(`/api/payments/orders/${orderId}`, { headers: headersB })).status, 404)
    assert.equal((await post('/api/payments/mock/complete', { orderId }, { headers: headersB })).status, 404)
  })
})

test('payment endpoints reject missing idempotency and real callback without provider configuration', async () => {
  await withTestServer(async ({ post }) => {
    const token = await login(post)
    const headers = { Authorization: `Bearer ${token}` }
    assert.equal((await post('/api/payments/orders', {}, { headers })).status, 400)
    assert.equal((await post('/api/payments/notify/alipay', { out_trade_no: 'ord_missing' })).status, 503)
  })
})
