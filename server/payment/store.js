import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getMySqlPool, isMySqlConfigured } from '../store/mysql.js'

let schemaReady

function paymentFilePath() {
  return process.env.ZHIXUE_PAYMENT_FILE || path.join(process.cwd(), 'server', 'payment-data.json')
}

function emptyStore() {
  return { orders: {}, entitlements: {}, notifications: {} }
}

function readStore() {
  const filePath = paymentFilePath()
  if (!fs.existsSync(filePath)) return emptyStore()
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return {
      orders: parsed.orders && typeof parsed.orders === 'object' ? parsed.orders : {},
      entitlements: parsed.entitlements && typeof parsed.entitlements === 'object' ? parsed.entitlements : {},
      notifications: parsed.notifications && typeof parsed.notifications === 'object' ? parsed.notifications : {},
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store) {
  const filePath = paymentFilePath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temp = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(temp, JSON.stringify(store, null, 2), 'utf8')
  fs.renameSync(temp, filePath)
}

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`
}

function amountText(priceCents) {
  return (priceCents / 100).toFixed(2)
}

export async function ensurePaymentSchema() {
  if (!isMySqlConfigured()) return false
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getMySqlPool()
      await db.query(`
        CREATE TABLE IF NOT EXISTS payment_orders (
          id VARCHAR(64) NOT NULL PRIMARY KEY,
          account_id VARCHAR(191) NOT NULL,
          product_id VARCHAR(64) NOT NULL,
          amount_cents INT UNSIGNED NOT NULL,
          currency CHAR(3) NOT NULL,
          status ENUM('pending','paid','cancelled','refunded','expired') NOT NULL,
          provider VARCHAR(32) NOT NULL,
          provider_trade_no VARCHAR(128) NULL,
          idempotency_key VARCHAR(128) NOT NULL,
          checkout_url TEXT NULL,
          created_at DATETIME(3) NOT NULL,
          paid_at DATETIME(3) NULL,
          updated_at DATETIME(3) NOT NULL,
          UNIQUE KEY payment_orders_account_idem (account_id, idempotency_key),
          KEY payment_orders_account_created (account_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `)
      await db.query(`
        CREATE TABLE IF NOT EXISTS payment_notifications (
          provider VARCHAR(32) NOT NULL,
          event_id VARCHAR(191) NOT NULL,
          order_id VARCHAR(64) NOT NULL,
          payload_json JSON NOT NULL,
          received_at DATETIME(3) NOT NULL,
          PRIMARY KEY (provider, event_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `)
      await db.query(`
        CREATE TABLE IF NOT EXISTS user_entitlements (
          id VARCHAR(64) NOT NULL PRIMARY KEY,
          account_id VARCHAR(191) NOT NULL,
          product_id VARCHAR(64) NOT NULL,
          order_id VARCHAR(64) NOT NULL,
          status ENUM('active','revoked','expired') NOT NULL,
          starts_at DATETIME(3) NOT NULL,
          ends_at DATETIME(3) NOT NULL,
          created_at DATETIME(3) NOT NULL,
          updated_at DATETIME(3) NOT NULL,
          UNIQUE KEY user_entitlements_order (order_id),
          KEY user_entitlements_account_status (account_id, status, ends_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `)
    })().catch(error => {
      schemaReady = undefined
      throw error
    })
  }
  return schemaReady
}

function publicOrder(order) {
  if (!order) return null
  return {
    id: order.id,
    productId: order.productId,
    amountCents: order.amountCents,
    amount: amountText(order.amountCents),
    currency: order.currency,
    status: order.status,
    provider: order.provider,
    providerTradeNo: order.providerTradeNo || null,
    checkoutUrl: order.checkoutUrl || null,
    createdAt: order.createdAt,
    paidAt: order.paidAt || null,
    updatedAt: order.updatedAt,
  }
}

export async function createOrder({ accountId, product, provider, idempotencyKey, checkoutUrl = null }) {
  if (!isMySqlConfigured()) {
    const store = readStore()
    const existing = Object.values(store.orders).find(order => order.accountId === accountId && order.idempotencyKey === idempotencyKey)
    if (existing) return { order: publicOrder(existing), duplicate: true }
    const now = new Date().toISOString()
    const order = {
      id: newId('ord'), accountId, productId: product.productId, amountCents: product.priceCents,
      currency: product.currency, status: 'pending', provider, providerTradeNo: null,
      idempotencyKey, checkoutUrl, createdAt: now, paidAt: null, updatedAt: now,
    }
    store.orders[order.id] = order
    writeStore(store)
    return { order: publicOrder(order), duplicate: false }
  }
  await ensurePaymentSchema()
  const db = getMySqlPool()
  const [existing] = await db.query('SELECT * FROM payment_orders WHERE account_id = ? AND idempotency_key = ?', [accountId, idempotencyKey])
  if (existing[0]) return { order: publicOrder(fromSqlOrder(existing[0])), duplicate: true }
  const id = newId('ord')
  const now = new Date()
  await db.query(`INSERT INTO payment_orders
    (id, account_id, product_id, amount_cents, currency, status, provider, idempotency_key, checkout_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
  [id, accountId, product.productId, product.priceCents, product.currency, provider, idempotencyKey, checkoutUrl, now, now])
  return { order: publicOrder({ id, accountId, productId: product.productId, amountCents: product.priceCents, currency: product.currency, status: 'pending', provider, idempotencyKey, checkoutUrl, createdAt: now, updatedAt: now }), duplicate: false }
}

function fromSqlOrder(row) {
  return {
    id: row.id, accountId: row.account_id, productId: row.product_id, amountCents: row.amount_cents,
    currency: row.currency, status: row.status, provider: row.provider, providerTradeNo: row.provider_trade_no,
    idempotencyKey: row.idempotency_key, checkoutUrl: row.checkout_url, createdAt: row.created_at,
    paidAt: row.paid_at, updatedAt: row.updated_at,
  }
}

export async function setCheckoutUrl(accountId, orderId, checkoutUrl) {
  if (!isMySqlConfigured()) {
    const store = readStore(); const order = store.orders[orderId]
    if (!order || order.accountId !== accountId) return null
    order.checkoutUrl = checkoutUrl; order.updatedAt = new Date().toISOString(); writeStore(store)
    return publicOrder(order)
  }
  await ensurePaymentSchema()
  await getMySqlPool().query('UPDATE payment_orders SET checkout_url = ?, updated_at = ? WHERE id = ? AND account_id = ?', [checkoutUrl, new Date(), orderId, accountId])
  return getOrder(accountId, orderId)
}

export async function getOrder(accountId, orderId) {
  if (!isMySqlConfigured()) {
    const order = readStore().orders[orderId]
    return order && order.accountId === accountId ? publicOrder(order) : null
  }
  await ensurePaymentSchema()
  const [rows] = await getMySqlPool().query('SELECT * FROM payment_orders WHERE id = ? AND account_id = ?', [orderId, accountId])
  return rows[0] ? publicOrder(fromSqlOrder(rows[0])) : null
}

export async function getOrderForProvider(orderId) {
  if (!isMySqlConfigured()) {
    const order = readStore().orders[orderId]
    return order ? publicOrder(order) : null
  }
  await ensurePaymentSchema()
  const [rows] = await getMySqlPool().query('SELECT * FROM payment_orders WHERE id = ?', [orderId])
  return rows[0] ? publicOrder(fromSqlOrder(rows[0])) : null
}

export async function listEntitlements(accountId) {
  if (!isMySqlConfigured()) {
    const now = Date.now()
    return Object.values(readStore().entitlements).filter(item => item.accountId === accountId).map(item => ({
      ...item,
      status: item.status === 'active' && Date.parse(item.endsAt) <= now ? 'expired' : item.status,
    }))
  }
  await ensurePaymentSchema()
  const [rows] = await getMySqlPool().query('SELECT * FROM user_entitlements WHERE account_id = ? ORDER BY ends_at DESC', [accountId])
  return rows.map(row => ({ id: row.id, accountId: row.account_id, productId: row.product_id, orderId: row.order_id, status: row.status, startsAt: row.starts_at, endsAt: row.ends_at, createdAt: row.created_at, updatedAt: row.updated_at }))
}

export async function applyPaymentEvent({ provider, eventId, orderId, providerTradeNo, amountCents, status, payload, accountId = null, durationDays }) {
  const paid = status === 'TRADE_SUCCESS' || status === 'TRADE_FINISHED' || status === 'paid'
  if (!paid) return { ok: true, duplicate: false, ignored: true }
  if (!isMySqlConfigured()) {
    const store = readStore()
    if (store.notifications[`${provider}:${eventId}`]) return { ok: true, duplicate: true }
    const order = store.orders[orderId]
    if (!order || (accountId && order.accountId !== accountId)) throw Object.assign(new Error('order not found'), { statusCode: 404 })
    if (order.amountCents !== amountCents) throw Object.assign(new Error('payment amount mismatch'), { statusCode: 400 })
    store.notifications[`${provider}:${eventId}`] = { provider, eventId, orderId, receivedAt: new Date().toISOString(), payload }
    if (order.status !== 'paid') {
      const now = new Date()
      order.status = 'paid'; order.providerTradeNo = providerTradeNo || null; order.paidAt = now.toISOString(); order.updatedAt = now.toISOString()
      const existing = Object.values(store.entitlements).find(item => item.orderId === order.id)
      if (!existing) {
        const end = new Date(now.getTime() + durationDays * 86400000)
        const entitlement = { id: newId('ent'), accountId: order.accountId, productId: order.productId, orderId: order.id, status: 'active', startsAt: now.toISOString(), endsAt: end.toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() }
        store.entitlements[entitlement.id] = entitlement
      }
    }
    writeStore(store)
    return { ok: true, duplicate: false, order: publicOrder(order) }
  }
  await ensurePaymentSchema()
  const db = getMySqlPool(); const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [inserted] = await conn.query('INSERT IGNORE INTO payment_notifications (provider, event_id, order_id, payload_json, received_at) VALUES (?, ?, ?, CAST(? AS JSON), ?)', [provider, eventId, orderId, JSON.stringify(payload || {}), new Date()])
    if (inserted.affectedRows === 0) { await conn.rollback(); return { ok: true, duplicate: true } }
    const [rows] = await conn.query('SELECT * FROM payment_orders WHERE id = ? FOR UPDATE', [orderId])
    const order = rows[0]
    if (!order || (accountId && order.account_id !== accountId)) throw Object.assign(new Error('order not found'), { statusCode: 404 })
    if (order.amount_cents !== amountCents) throw Object.assign(new Error('payment amount mismatch'), { statusCode: 400 })
    if (order.status !== 'paid') {
      const now = new Date(); const end = new Date(now.getTime() + durationDays * 86400000); const entitlementId = newId('ent')
      await conn.query('UPDATE payment_orders SET status = \'paid\', provider_trade_no = ?, paid_at = ?, updated_at = ? WHERE id = ?', [providerTradeNo || null, now, now, orderId])
      await conn.query('INSERT IGNORE INTO user_entitlements (id, account_id, product_id, order_id, status, starts_at, ends_at, created_at, updated_at) VALUES (?, ?, ?, ?, \'active\', ?, ?, ?, ?)', [entitlementId, order.account_id, order.product_id, orderId, now, end, now, now])
    }
    await conn.commit(); return { ok: true, duplicate: false, order: await getOrder(accountId || order.account_id, orderId) }
  } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
}
