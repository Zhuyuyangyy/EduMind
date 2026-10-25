import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { paymentConfig, providerConfigStatus, isProductionPayment, paymentError } from './provider.js'
import { getMySqlPool, isMySqlConfigured } from '../store/mysql.js'

let schemaReady
let jsonMutation = Promise.resolve()

function paymentFilePath() {
  return process.env.ZHIXUE_PAYMENT_FILE || path.join(process.cwd(), 'server', 'payment-data.json')
}

function emptyStore() {
  return { orders: {}, entitlements: {}, notifications: {}, refunds: {} }
}

function readStore() {
  if (isProductionPayment()) throw paymentError('production-storage-not-configured', 503)
  const filePath = paymentFilePath()
  if (!fs.existsSync(filePath)) return emptyStore()
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const record = value => value && typeof value === 'object' && !Array.isArray(value)
    if (!record(parsed) || !['orders', 'entitlements', 'notifications'].every(key => record(parsed[key])) || (parsed.refunds !== undefined && !record(parsed.refunds))) throw paymentError('payment-storage-unreadable', 503)
    return {
      refunds: parsed.refunds || {},
      orders: parsed.orders && typeof parsed.orders === 'object' ? parsed.orders : {},
      entitlements: parsed.entitlements && typeof parsed.entitlements === 'object' ? parsed.entitlements : {},
      notifications: parsed.notifications && typeof parsed.notifications === 'object' ? parsed.notifications : {},
    }
  } catch {
    throw paymentError('payment-storage-unreadable', 503)
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

function mutateJson(action) {
  const operation = jsonMutation.then(async () => {
    const store = readStore()
    const result = await action(store)
    writeStore(store)
    return result
  })
  jsonMutation = operation.catch(() => {})
  return operation
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

      const conn = await db.getConnection()
      try {
        const [locks] = await conn.query("SELECT GET_LOCK('edumind_payment_schema_v2', 15) AS acquired")
        if (Number(locks[0].acquired) !== 1) throw paymentError('payment-schema-lock-timeout', 503)
        const [columns] = await conn.query('SHOW COLUMNS FROM payment_orders')
        const known = new Set(columns.map(row => row.Field))
        const additions = { duration_days: 'INT UNSIGNED NULL', data_source: 'VARCHAR(16) NULL', app_id: 'VARCHAR(64) NULL', seller_id: 'VARCHAR(64) NULL' }
        for (const [name, type] of Object.entries(additions)) {
          if (!known.has(name)) await conn.query(`ALTER TABLE payment_orders ADD COLUMN ${name} ${type}`)
        }
        const [indexes] = await conn.query('SHOW INDEX FROM payment_orders')
        const tradeIndex = indexes.filter(row => row.Key_name === 'payment_order_trade').sort((a, b) => a.Seq_in_index - b.Seq_in_index)
        if (!tradeIndex.length) {
          await conn.query('ALTER TABLE payment_orders ADD UNIQUE KEY payment_order_trade (provider, data_source, provider_trade_no)')
        } else if (tradeIndex.some(row => Number(row.Non_unique) !== 0) || tradeIndex.map(row => row.Column_name).join(',') !== 'provider,data_source,provider_trade_no') throw paymentError('payment-schema-incompatible', 503)
        await conn.query(`CREATE TABLE IF NOT EXISTS payment_refunds (
          order_id VARCHAR(64) NOT NULL PRIMARY KEY,
          request_id VARCHAR(64) NOT NULL UNIQUE,
          amount_cents INT UNSIGNED NOT NULL,
          status ENUM('pending','succeeded') NOT NULL,
          created_at DATETIME(3) NOT NULL,
          updated_at DATETIME(3) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
      } finally {
        try { await conn.query("SELECT RELEASE_LOCK('edumind_payment_schema_v2')") } finally { conn.release() }
      }
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
    dataSource: order.dataSource || 'unknown',
    simulated: order.dataSource !== 'real',
    durationDays: order.durationDays || null,
    appId: order.appId || null,
    sellerId: order.sellerId || null,
    providerTradeNo: order.providerTradeNo || null,
    checkoutUrl: order.checkoutUrl || null,
    createdAt: order.createdAt,
    paidAt: order.paidAt || null,
    updatedAt: order.updatedAt,
  }
}


function checkIdempotent(order, product, provider) {
  if (order.productId !== product.productId || order.provider !== provider || order.dataSource !== providerConfigStatus().dataSource || order.appId !== (provider === 'vibe-pay' ? paymentConfig().appId : null)) throw paymentError('payment-idempotency-conflict', 409)
  return { order: publicOrder(order), duplicate: true }
}

export async function createOrder({ accountId, product, provider, idempotencyKey }) {
  const now = new Date()
  const order = {
    id: newId('ord'), accountId, productId: product.productId, amountCents: product.priceCents,
    currency: product.currency, durationDays: product.durationDays, dataSource: providerConfigStatus().dataSource,
    appId: provider === 'vibe-pay' ? paymentConfig().appId : null,
    sellerId: provider === 'vibe-pay' ? paymentConfig().sellerId : null,
    status: 'pending', provider, providerTradeNo: null, idempotencyKey,
    checkoutUrl: null, createdAt: now.toISOString(), paidAt: null, updatedAt: now.toISOString(),
  }
  if (!isMySqlConfigured()) {
    return mutateJson(store => {
      const existing = Object.values(store.orders).find(item => item.accountId === accountId && item.idempotencyKey === idempotencyKey)
      if (existing) return checkIdempotent(existing, product, provider)
      store.orders[order.id] = order
      return { order: publicOrder(order), duplicate: false }
    })
  } else {
    await ensurePaymentSchema()
    const db = getMySqlPool()
    try {
      await db.query(`INSERT INTO payment_orders (id, account_id, product_id, amount_cents, currency, duration_days, data_source, app_id, seller_id, status, provider, idempotency_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
        [order.id, accountId, order.productId, order.amountCents, order.currency, order.durationDays, order.dataSource, order.appId, order.sellerId, provider, idempotencyKey, now, now])
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error
      const [rows] = await db.query('SELECT * FROM payment_orders WHERE account_id = ? AND idempotency_key = ?', [accountId, idempotencyKey])
      if (!rows[0]) throw error
      return checkIdempotent(fromSqlOrder(rows[0]), product, provider)
    }
  }
  return { order: publicOrder(order), duplicate: false }
}

function fromSqlOrder(row) {
  return {
    id: row.id, accountId: row.account_id, productId: row.product_id, amountCents: row.amount_cents,
    currency: row.currency, status: row.status, provider: row.provider, providerTradeNo: row.provider_trade_no,
    durationDays: row.duration_days, dataSource: row.data_source, appId: row.app_id, sellerId: row.seller_id,
    idempotencyKey: row.idempotency_key, checkoutUrl: row.checkout_url, createdAt: row.created_at,
    paidAt: row.paid_at, updatedAt: row.updated_at,
  }
}

export async function setCheckoutUrl(accountId, orderId, checkoutUrl) {
  if (!isMySqlConfigured()) {
    return mutateJson(store => {
      const order = store.orders[orderId]
      if (!order || order.accountId !== accountId) return null
      order.checkoutUrl = checkoutUrl; order.updatedAt = new Date().toISOString()
      return publicOrder(order)
    })
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
    const store = readStore()
    return Object.values(store.entitlements).filter(item => item.accountId === accountId && store.orders[item.orderId]?.dataSource === providerConfigStatus().dataSource).map(item => ({
      ...item,
      dataSource: store.orders[item.orderId].dataSource,
      simulated: store.orders[item.orderId].dataSource !== 'real',
      status: item.status === 'active' && Date.parse(item.endsAt) <= now ? 'expired' : item.status,
    }))
  }
  await ensurePaymentSchema()
  const [rows] = await getMySqlPool().query('SELECT e.*, o.data_source FROM user_entitlements e JOIN payment_orders o ON o.id = e.order_id WHERE e.account_id = ? AND o.data_source = ? ORDER BY e.ends_at DESC', [accountId, providerConfigStatus().dataSource])
  return rows.map(row => ({ id: row.id, accountId: row.account_id, productId: row.product_id, orderId: row.order_id, dataSource: row.data_source, simulated: row.data_source !== 'real', status: row.status === 'active' && new Date(row.ends_at).getTime() <= Date.now() ? 'expired' : row.status, startsAt: row.starts_at, endsAt: row.ends_at, createdAt: row.created_at, updatedAt: row.updated_at }))
}


// Serialize all mutations of one order before touching its event/refund/entitlement.
// JSON is intentionally restricted to single-process, non-production development.
async function withOrder(orderId, accountId, action) {
  if (!isMySqlConfigured()) {
    return mutateJson(async store => {
      const order = store.orders[orderId]
      if (!order || (accountId && order.accountId !== accountId)) throw paymentError('payment-order-not-found', 404)
      return action(order, { store })
    })
  }
  await ensurePaymentSchema()
  const conn = await getMySqlPool().getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query('SELECT * FROM payment_orders WHERE id = ? FOR UPDATE', [orderId])
    const order = rows[0] && fromSqlOrder(rows[0])
    if (!order || (accountId && order.accountId !== accountId)) throw paymentError('payment-order-not-found', 404)
    const result = await action(order, { conn })
    await conn.commit()
    return result
  } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
}

export async function applyPaymentEvent({ provider, eventId, orderId, providerTradeNo, amountCents, status, accountId = null }) {
  if (!eventId || eventId.length > 191 || !providerTradeNo || providerTradeNo.length > 128) throw paymentError('invalid-payment-event')
  return withOrder(orderId, accountId, async (order, { store, conn }) => {
    if (order.provider !== provider || order.dataSource !== providerConfigStatus().dataSource || order.amountCents !== amountCents || !order.durationDays ||
        (provider === 'vibe-pay' && (order.appId !== paymentConfig().appId || order.sellerId !== paymentConfig().sellerId)) ||
        (order.providerTradeNo && order.providerTradeNo !== providerTradeNo)) throw paymentError('payment-order-mismatch')
    const event = { orderId, providerTradeNo, amountCents, status }
    const key = `${provider}:${eventId}`
    const previous = store ? store.notifications[key] : (await conn.query('SELECT payload_json FROM payment_notifications WHERE provider = ? AND event_id = ?', [provider, eventId]))[0][0]?.payload_json
    const previousEvent = store ? previous : typeof previous === 'string' ? JSON.parse(previous) : previous
    if (previousEvent) {
      if (JSON.stringify(previousEvent) !== JSON.stringify(event) && (previousEvent.orderId !== orderId || previousEvent.providerTradeNo !== providerTradeNo || previousEvent.amountCents !== amountCents || previousEvent.status !== status)) throw paymentError('payment-event-conflict', 409)
      return { ok: true, duplicate: true, order: publicOrder(order) }
    }
    const paid = ['TRADE_SUCCESS', 'TRADE_FINISHED', 'paid'].includes(status)
    if (paid && order.status === 'pending') {
      if (store && Object.values(store.orders).some(item => item.id !== orderId && item.provider === provider && item.dataSource === order.dataSource && item.providerTradeNo === providerTradeNo)) throw paymentError('payment-trade-conflict', 409)
      const now = new Date()
      const ends = new Date(now.getTime() + order.durationDays * 86400000)
      const entitlement = { id: newId('ent'), accountId: order.accountId, productId: order.productId, orderId, status: 'active', startsAt: now.toISOString(), endsAt: ends.toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() }
      if (store) store.entitlements[entitlement.id] = entitlement
      else {
        await conn.query("UPDATE payment_orders SET status = 'paid', provider_trade_no = ?, paid_at = ?, updated_at = ? WHERE id = ?", [providerTradeNo, now, now, orderId])
        await conn.query("INSERT INTO user_entitlements (id, account_id, product_id, order_id, status, starts_at, ends_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)", [entitlement.id, order.accountId, order.productId, orderId, now, ends, now, now])
      }
      Object.assign(order, { status: 'paid', providerTradeNo, paidAt: now.toISOString(), updatedAt: now.toISOString() })
    } else if (paid && !['paid', 'refunded'].includes(order.status)) throw paymentError('payment-state-requires-reconciliation', 409)
    if (store) store.notifications[key] = event
    else await conn.query('INSERT INTO payment_notifications (provider, event_id, order_id, payload_json, received_at) VALUES (?, ?, ?, ?, ?)', [provider, eventId, orderId, JSON.stringify(event), new Date()])
    return { ok: true, duplicate: false, ignored: !paid || order.status === 'refunded', order: publicOrder(order) }
  })
}

function sqlRefund(row) {
  return row ? { orderId: row.order_id, requestId: row.request_id, amountCents: row.amount_cents, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at } : null
}

export async function getRefund(accountId, orderId) {
  if (!await getOrder(accountId, orderId)) throw paymentError('payment-order-not-found', 404)
  if (!isMySqlConfigured()) return readStore().refunds[orderId] || null
  const [rows] = await getMySqlPool().query('SELECT * FROM payment_refunds WHERE order_id = ?', [orderId])
  return sqlRefund(rows[0])
}

// One full refund per order. A timeout retains the same request ID and amount.
export async function prepareRefund(accountId, orderId) {
  return withOrder(orderId, accountId, async (order, { store, conn }) => {
    const existing = store ? store.refunds[orderId] : sqlRefund((await conn.query('SELECT * FROM payment_refunds WHERE order_id = ?', [orderId]))[0][0])
    if (existing) return existing
    if (order.status !== 'paid') throw paymentError('payment-order-not-refundable', 409)
    const now = new Date()
    const refund = { orderId, requestId: `rf_${orderId}`, amountCents: order.amountCents, status: 'pending', createdAt: now.toISOString(), updatedAt: now.toISOString() }
    if (store) store.refunds[orderId] = refund
    else await conn.query("INSERT INTO payment_refunds (order_id, request_id, amount_cents, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)", [orderId, refund.requestId, refund.amountCents, now, now])
    return refund
  })
}

export async function confirmRefund(accountId, orderId, requestId) {
  return withOrder(orderId, accountId, async (order, { store, conn }) => {
    const refund = store ? store.refunds[orderId] : sqlRefund((await conn.query('SELECT * FROM payment_refunds WHERE order_id = ?', [orderId]))[0][0])
    if (!refund || refund.requestId !== requestId || refund.amountCents !== order.amountCents || !['paid','refunded'].includes(order.status)) throw paymentError('payment-refund-mismatch', 409)
    const now = new Date()
    if (store) {
      refund.status = 'succeeded'; refund.updatedAt = now.toISOString()
      order.status = 'refunded'; order.updatedAt = now.toISOString()
      for (const item of Object.values(store.entitlements)) if (item.orderId === orderId) { item.status = 'revoked'; item.updatedAt = now.toISOString() }
    } else {
      await conn.query("UPDATE payment_refunds SET status = 'succeeded', updated_at = ? WHERE order_id = ?", [now, orderId])
      await conn.query("UPDATE payment_orders SET status = 'refunded', updated_at = ? WHERE id = ?", [now, orderId])
      await conn.query("UPDATE user_entitlements SET status = 'revoked', updated_at = ? WHERE order_id = ?", [now, orderId])
    }
    return { ...refund, status: 'succeeded' }
  })
}

export async function markClosed(accountId, orderId) {
  return withOrder(orderId, accountId, async (order, { store, conn }) => {
    if (order.status !== 'pending') return publicOrder(order)
    if (store) { order.status = 'cancelled'; order.updatedAt = new Date().toISOString() }
    else await conn.query("UPDATE payment_orders SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'pending'", [new Date(), orderId])
    return { ...publicOrder(order), status: 'cancelled' }
  })
}
