import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import mysql from 'mysql2/promise'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const configured = Boolean(process.env.MYSQL_URL || (process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE))
const database = `edumind_pay_${crypto.randomBytes(8).toString('hex')}`
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'edumind-payment-store-'))
let admin, store, pool
const account = () => `pay-${crypto.randomUUID()}`
const product = { productId: 'ai-7day-pack', priceCents: 100, currency: 'CNY', durationDays: 7 }
process.env.PAYMENT_PROVIDER = 'mock'
process.env.ZHIXUE_PAYMENT_FILE = path.join(directory, 'payments.json')
before(async () => {
  if (configured) {
    admin = await mysql.createConnection(process.env.MYSQL_URL || { host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD || '' })
    await admin.query(`CREATE DATABASE ${database}`)
    await admin.query(`CREATE TABLE ${database}.payment_orders (
      id VARCHAR(64) NOT NULL PRIMARY KEY, account_id VARCHAR(191) NOT NULL,
      product_id VARCHAR(64) NOT NULL, amount_cents INT UNSIGNED NOT NULL,
      currency CHAR(3) NOT NULL, status ENUM('pending','paid','cancelled','refunded','expired') NOT NULL,
      provider VARCHAR(32) NOT NULL, provider_trade_no VARCHAR(128) NULL,
      idempotency_key VARCHAR(128) NOT NULL, checkout_url TEXT NULL,
      created_at DATETIME(3) NOT NULL, paid_at DATETIME(3) NULL, updated_at DATETIME(3) NOT NULL,
      UNIQUE KEY payment_orders_account_idem (account_id, idempotency_key),
      KEY payment_orders_account_created (account_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await admin.query(`INSERT INTO ${database}.payment_orders
      (id,account_id,product_id,amount_cents,currency,status,provider,idempotency_key,created_at,updated_at)
      VALUES ('legacy-preserved','legacy-owner','ai-7day-pack',100,'CNY','pending','mock','legacy-key',NOW(),NOW())`)
    const cfg = admin.config
    Object.assign(process.env, { MYSQL_URL: '', MYSQL_HOST: cfg.host, MYSQL_PORT: String(cfg.port), MYSQL_USER: cfg.user, MYSQL_PASSWORD: cfg.password || '', MYSQL_DATABASE: database })
  }
  store = await import('./payment/store.js')
  pool = await import('./store/mysql.js')
})
after(async () => {
  await pool?.closeMySqlPool()
  if (admin) { await admin.query(`DROP DATABASE IF EXISTS ${database}`); await admin.end() }
  fs.rmSync(directory, { recursive: true, force: true })
})
const make = (owner, key = crypto.randomUUID()) => store.createOrder({ accountId: owner, product, provider: 'mock', idempotencyKey: key })
const pay = (order, eventId = crypto.randomUUID(), overrides = {}) => store.applyPaymentEvent({ provider: 'mock', eventId, orderId: order.id, providerTradeNo: `trade-${order.id}`, amountCents: 100, status: 'paid', ...overrides })

function worker(request, expectedExit = 0) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/payment-storage-worker.mjs'], { cwd: fileURLToPath(new URL('..', import.meta.url)), env: process.env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let output = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('payment worker timed out')) }, 30000)
    child.stdout.on('data', chunk => { output += chunk })
    child.on('error', reject)
    child.on('exit', code => { clearTimeout(timer); try { const result = JSON.parse(output.trim()); assert.equal(code, expectedExit, result.code); resolve(expectedExit === 0 ? result.result : result) } catch (error) { reject(error) } })
    child.stdin.end(JSON.stringify(request))
  })
}

test('MySQL payments: separate processes share order/event/refund idempotency', { skip: configured ? false : '需要真实 MySQL：多进程支付事务未在 JSON 模式执行' }, async () => {
  const owner = account(), key = crypto.randomUUID()
  const input = { accountId: owner, product, provider: 'mock', idempotencyKey: key }
  const orders = await Promise.all(Array.from({ length: 3 }, () => worker({ action: 'create', input })))
  assert.equal(new Set(orders.map(item => item.order.id)).size, 1)
  const order = orders[0].order
  await Promise.all(Array.from({ length: 3 }, (_, n) => worker({ action: 'pay', input: { provider: 'mock', eventId: `process-${n}-${order.id}`, orderId: order.id, providerTradeNo: `trade-${order.id}`, amountCents: 100, status: 'paid' } })))
  assert.equal((await store.listEntitlements(owner)).length, 1)
  const refunds = await Promise.all(Array.from({ length: 3 }, () => worker({ action: 'refund', accountId: owner, orderId: order.id })))
  assert.equal(new Set(refunds.map(item => item.requestId)).size, 1)
  await Promise.all(refunds.map(item => worker({ action: 'confirm', accountId: owner, orderId: order.id, requestId: item.requestId })))
  assert.equal((await store.listEntitlements(owner))[0].status, 'revoked')
  const legacy = await store.getOrder('legacy-owner', 'legacy-preserved')
  assert.equal(legacy.amountCents, 100); assert.equal(legacy.status, 'pending')
  assert.equal(legacy.dataSource, 'unknown'); assert.equal(legacy.durationDays, null)
  const db = pool.getMySqlPool()
  await db.query('ALTER TABLE payment_orders DROP INDEX payment_order_trade, ADD INDEX payment_order_trade (provider_trade_no)')
  try {
    const invalidSchema = await worker({ action: 'create', input: { ...input, idempotencyKey: crypto.randomUUID() } }, 1)
    assert.equal(invalidSchema.code, 'payment-schema-incompatible')
  } finally {
    await db.query('ALTER TABLE payment_orders DROP INDEX payment_order_trade, ADD UNIQUE INDEX payment_order_trade (provider, data_source, provider_trade_no)')
  }
})

test('payment storage: concurrent idempotent creation returns one order and snapshot price', async () => {
  const owner = account(), key = crypto.randomUUID()
  const results = await Promise.all(Array.from({ length: 12 }, () => make(owner, key)))
  assert.equal(new Set(results.map(item => item.order.id)).size, 1)
  assert.equal(results.filter(item => !item.duplicate).length, 1)
  const changed = await store.createOrder({ accountId: owner, product: { ...product, priceCents: 200 }, provider: 'mock', idempotencyKey: key })
  assert.equal(changed.order.amountCents, 100)
  await assert.rejects(store.createOrder({ accountId: owner, product: { ...product, productId: 'other' }, provider: 'mock', idempotencyKey: key }), { code: 'payment-idempotency-conflict' })
  assert.notEqual((await make(account(), key)).order.id, changed.order.id)
})

test('payment storage: concurrent notifications grant once without extending expiry', async () => {
  const owner = account(), { order } = await make(owner)
  await Promise.all(Array.from({ length: 12 }, (_, n) => pay(order, `notify-${order.id}-${n}`)))
  const entitlements = await store.listEntitlements(owner)
  assert.equal(entitlements.length, 1)
  assert.equal(new Date(entitlements[0].endsAt) - new Date(entitlements[0].startsAt), 7 * 86400000)
  await pay(order, 'late-duplicate')
  assert.equal(String((await store.listEntitlements(owner))[0].endsAt), String(entitlements[0].endsAt))
  assert.equal(entitlements[0].dataSource, 'mock'); assert.equal(entitlements[0].simulated, true)
})

test('payment storage: invalid events roll back and event/trade collisions reject', async () => {
  const owner = account(), { order } = await make(owner)
  await assert.rejects(pay(order, 'rollback-event', { amountCents: 200 }), { code: 'payment-order-mismatch' })
  assert.equal((await store.listEntitlements(owner)).length, 0)
  await pay(order, 'rollback-event')
  await assert.rejects(pay(order, 'other-trade', { providerTradeNo: 'different-trade' }), { code: 'payment-order-mismatch' })
  await assert.rejects(pay(order, 'cross-account', { accountId: account() }), { statusCode: 404 })
  const other = (await make(owner)).order
  await assert.rejects(pay(other, 'rollback-event'), { code: 'payment-event-conflict' })
  await assert.rejects(pay(other, 'collision-trade', { providerTradeNo: `trade-${order.id}` }))
  assert.equal((await store.getOrder(owner, other.id)).status, 'pending')
})

test('payment storage: concurrent full refunds revoke once; late payment cannot restore rights', async () => {
  const owner = account(), { order } = await make(owner)
  await pay(order)
  const refunds = await Promise.all(Array.from({ length: 8 }, () => store.prepareRefund(owner, order.id)))
  assert.equal(new Set(refunds.map(item => item.requestId)).size, 1)
  assert.equal((await store.listEntitlements(owner))[0].status, 'active', 'requesting refund is not refund confirmation')
  await assert.rejects(store.confirmRefund(owner, order.id, 'wrong-request'), { code: 'payment-refund-mismatch' })
  await Promise.all(refunds.map(item => store.confirmRefund(owner, order.id, item.requestId)))
  await pay(order, 'late-after-refund')
  assert.equal((await store.getOrder(owner, order.id)).status, 'refunded')
  assert.equal((await store.listEntitlements(owner))[0].status, 'revoked')
  await assert.rejects(store.getRefund(account(), order.id), { statusCode: 404 })
})

test('payment storage: closed orders never grant on a delayed paid event', async () => {
  const owner = account(), { order } = await make(owner)
  await store.markClosed(owner, order.id)
  await assert.rejects(pay(order), { code: 'payment-state-requires-reconciliation' })
  assert.equal((await store.listEntitlements(owner)).length, 0)
})

test('payment storage: entitlement expiry and provider data boundaries are identical in SQL/JSON', async () => {
  const owner = account(), { order } = await make(owner)
  await pay(order)
  if (configured) await pool.getMySqlPool().query('UPDATE user_entitlements SET ends_at = ? WHERE order_id = ?', [new Date(Date.now() - 1000), order.id])
  else {
    const file = process.env.ZHIXUE_PAYMENT_FILE, data = JSON.parse(fs.readFileSync(file, 'utf8'))
    Object.values(data.entitlements).find(item => item.orderId === order.id).endsAt = new Date(Date.now() - 1000).toISOString()
    fs.writeFileSync(file, JSON.stringify(data))
  }
  assert.equal((await store.listEntitlements(owner))[0].status, 'expired')
  process.env.PAYMENT_PROVIDER = 'vibe-pay'
  try { assert.equal((await store.listEntitlements(owner)).length, 0, 'mock entitlements cannot be used as sandbox/real rights') }
  finally { process.env.PAYMENT_PROVIDER = 'mock' }
})

test('payment storage: legacy orders without duration evidence fail closed', async () => {
  const owner = account(), { order } = await make(owner)
  if (configured) await pool.getMySqlPool().query('UPDATE payment_orders SET duration_days = NULL WHERE id = ?', [order.id])
  else {
    const file = process.env.ZHIXUE_PAYMENT_FILE, data = JSON.parse(fs.readFileSync(file, 'utf8'))
    delete data.orders[order.id].durationDays; fs.writeFileSync(file, JSON.stringify(data))
  }
  await assert.rejects(pay(order), { code: 'payment-order-mismatch' })
  assert.equal((await store.listEntitlements(owner)).length, 0)
})

test('JSON payment storage corruption is explicit and never resets orders', async () => {
  const originalHost = process.env.MYSQL_HOST, originalUrl = process.env.MYSQL_URL
  process.env.MYSQL_HOST = ''; process.env.MYSQL_URL = ''
  const file = process.env.ZHIXUE_PAYMENT_FILE, saved = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.from('{"orders":{},"entitlements":{},"notifications":{}}')
  try {
    for (const invalid of ['{broken', '[]', '{}', '{"orders":[],"entitlements":{},"notifications":{}}']) {
      fs.writeFileSync(file, invalid)
      await assert.rejects(make(account()), { code: 'payment-storage-unreadable' })
    }
  }
  finally { fs.writeFileSync(file, saved); process.env.MYSQL_HOST = originalHost || ''; process.env.MYSQL_URL = originalUrl || '' }
})
